"""
portfolio_agent.py

LangGraph-powered portfolio analysis agent.

Accepts a portfolio (tickers + weights) and a chat history, decides which
math tools to invoke, executes them, and returns a structured JSON response
containing:
  - message    : the AI's conversational reply
  - chart_type : which frontend view to activate
  - chart_data : metric dicts ready for charting

LLM priority (explicit, regardless of LLM_PROVIDER env var):
  1. Groq  (llama-3.3-70b-versatile) — used whenever GROQ_API_KEY is set.
  2. Anthropic (claude-haiku-4-5)    — fallback if only ANTHROPIC_API_KEY set.
  3. Neither key → RuntimeError at build time (caught; fallback computes metrics
     directly from yfinance without any LLM call).

Crash-resilience contract:
  If the LLM layer throws ANY exception (bad API key, rate limit, network error,
  graph crash), run_agent / run_agent_async NEVER returns chart_type='none' with
  null chart_data when a portfolio is available.  Instead it calls
  _compute_portfolio_metrics_direct() which fetches live yfinance data and
  computes weighted portfolio metrics, returning chart_type='comparison' so the
  frontend canvas shows real numbers instead of reverting to mock data.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Annotated, Any, Literal

import pandas as pd
from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_core.tools import tool
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from pydantic import BaseModel
from typing_extensions import TypedDict

from services.portfolio_math import (
    Exchange,
    calculate_annualized_volatility,
    calculate_cagr,
    calculate_max_drawdown,
    calculate_sharpe_ratio,
    calculate_total_return,
    calculate_var_95,
    fetch_historical_prices,
    sanitize_ticker,
)

logger = logging.getLogger(__name__)

# ── LLM Configuration ──────────────────────────────────────────────────────────

_PROVIDER       = os.getenv("LLM_PROVIDER", "groq").lower()   # default to groq
_ANTHROPIC_KEY  = os.getenv("ANTHROPIC_API_KEY", "")
_ANTHROPIC_MODEL= os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
_GROQ_KEY       = os.getenv("GROQ_API_KEY", "")
_GROQ_MODEL     = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")


def _build_llm():
    """
    Build and return the configured LLM.

    Priority rule (hard-coded, overrides LLM_PROVIDER env var):
      1. GROQ_API_KEY present  → always use Groq (llama-3.3-70b-versatile).
         Groq is faster, cheaper, and the intended provider for this service.
      2. Only ANTHROPIC_API_KEY present → fall back to Anthropic (claude-haiku).
      3. Neither key set → raise RuntimeError so the caller can engage the
         LLM-free portfolio fallback instead of crashing the request.
    """
    def _groq():
        from langchain_groq import ChatGroq  # noqa: PLC0415
        return ChatGroq(
            model=_GROQ_MODEL,
            groq_api_key=_GROQ_KEY,
            temperature=0.3,
            max_tokens=1024,
        )

    def _anthropic():
        from langchain_anthropic import ChatAnthropic  # noqa: PLC0415
        return ChatAnthropic(
            model=_ANTHROPIC_MODEL,
            anthropic_api_key=_ANTHROPIC_KEY,
            temperature=0.3,
            max_tokens=1024,
        )

    # ── Groq takes priority whenever the key exists ────────────────────────────
    if _GROQ_KEY:
        if _PROVIDER != "groq":
            logger.info(
                "GROQ_API_KEY found — overriding LLM_PROVIDER=%r and using "
                "Groq (%s) as the primary LLM.",
                _PROVIDER, _GROQ_MODEL,
            )
        return _groq()

    # ── Anthropic fallback (only when Groq key is absent) ──────────────────────
    if _ANTHROPIC_KEY:
        logger.warning(
            "GROQ_API_KEY not set — falling back to Anthropic (%s). "
            "Add GROQ_API_KEY to .env to use the preferred Groq provider.",
            _ANTHROPIC_MODEL,
        )
        return _anthropic()

    raise RuntimeError(
        "No LLM API key configured. "
        "Set GROQ_API_KEY (preferred) or ANTHROPIC_API_KEY in your .env file."
    )


# ── Rate-limit detection ───────────────────────────────────────────────────────

# Sentinel string embedded in the AIMessage content when _agent_node catches
# a Groq / OpenAI HTTP 429.  run_agent() Phase 4 recognises it via
# _LLM_FAILURE_PHRASES and routes to _agent_fallback() which uses the exact
# user-facing message mandated by the product spec.
_RATE_LIMIT_MARKER: str = "__groq_rate_limit__"


def _is_rate_limit_error(exc: Exception) -> bool:
    """
    Return True if *exc* is a Groq / OpenAI HTTP 429 rate-limit error.

    Matches all of these surface forms:
      • openai.RateLimitError (raised by langchain_groq / langchain_openai)
      • groq.RateLimitError  (direct Groq SDK)
      • Any exception whose type name contains "ratelimit" (case-insensitive)
      • Any exception whose string representation contains "rate limit",
        "rate_limit", "429", or "too many requests"
    """
    exc_type = type(exc).__name__.lower()
    exc_msg  = str(exc).lower()
    return (
        "ratelimiterror" in exc_type
        or "rate_limit_error" in exc_type
        or "rate limit" in exc_msg
        or "rate_limit" in exc_msg
        or "429" in exc_msg
        or "too many requests" in exc_msg
    )


# Lazy-cached LLM + tool-bound variant
_LLM_WITH_TOOLS: Any = None


def _get_llm_with_tools():
    global _LLM_WITH_TOOLS
    if _LLM_WITH_TOOLS is None:
        _LLM_WITH_TOOLS = _build_llm().bind_tools(_TOOLS)
    return _LLM_WITH_TOOLS


# ── Agent State ────────────────────────────────────────────────────────────────

class PortfolioAgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    # Portfolio context forwarded to every tool call
    portfolio: list[dict]        # [{"ticker": "RELIANCE", "weight": 0.30}, ...]
    exchange: str                # "NSE" | "BSE"
    period: str                  # yfinance period string
    # Accumulated tool outputs, keyed by tool name, populated by format_response node
    tool_outputs: dict[str, Any]


# ── Tool Input Schemas ─────────────────────────────────────────────────────────

class _PerformanceInput(BaseModel):
    tickers: list[str]
    exchange: str = "NSE"
    period: str = "1y"


class _RiskInput(BaseModel):
    tickers: list[str]
    exchange: str = "NSE"
    period: str = "1y"


class _WeightedInput(BaseModel):
    tickers: list[str]
    weights: list[float]
    exchange: str = "NSE"
    period: str = "1y"


class _WhatIfInput(BaseModel):
    current_portfolio: list[dict]
    sell_ticker: str
    sell_weight: float
    buy_ticker: str
    buy_weight: float
    exchange: str = "NSE"
    period: str = "1y"


# ── Tool Implementations ───────────────────────────────────────────────────────

@tool("get_performance_metrics", args_schema=_PerformanceInput)
def get_performance_metrics(
    tickers: list[str],
    exchange: str = "NSE",
    period: str = "1y",
) -> dict:
    """
    Fetch historical price data and compute performance metrics for the given tickers.
    Returns CAGR (%), total return (%), and annualized volatility (%) per ticker.
    Call this when the user asks about returns, growth, or performance over a period.
    """
    exch = Exchange.NSE if exchange.upper() == "NSE" else Exchange.BSE
    metrics: dict[str, Any] = {}
    errors: list[dict] = []

    for ticker in tickers:
        try:
            df = fetch_historical_prices(ticker, exch, period, "1d")
            prices: pd.Series = df["Close"].dropna()
            metrics[ticker] = {
                "cagr_pct": round(calculate_cagr(prices) * 100, 2),
                "total_return_pct": round(calculate_total_return(prices) * 100, 2),
                "annualized_volatility_pct": round(
                    calculate_annualized_volatility(prices) * 100, 2
                ),
                "period": period,
                "bars": len(prices),
            }
        except Exception as exc:
            logger.warning("get_performance_metrics failed for %s: %s", ticker, exc)
            errors.append({"ticker": ticker, "error": str(exc)})

    return {
        "_tool": "get_performance_metrics",
        "chart_type": "performance",
        "metrics": metrics,
        "errors": errors,
    }


@tool("get_risk_metrics", args_schema=_RiskInput)
def get_risk_metrics(
    tickers: list[str],
    exchange: str = "NSE",
    period: str = "1y",
) -> dict:
    """
    Compute risk metrics for the given tickers using historical price data.
    Returns 1-day VaR at 95% confidence (%), maximum drawdown (%), and Sharpe ratio.
    Call this when the user asks about downside risk, drawdowns, volatility, or VaR.
    """
    exch = Exchange.NSE if exchange.upper() == "NSE" else Exchange.BSE
    metrics: dict[str, Any] = {}
    errors: list[dict] = []

    for ticker in tickers:
        try:
            df = fetch_historical_prices(ticker, exch, period, "1d")
            prices: pd.Series = df["Close"].dropna()
            metrics[ticker] = {
                "var_95_pct": round(calculate_var_95(prices) * 100, 2),
                "max_drawdown_pct": round(calculate_max_drawdown(prices) * 100, 2),
                "sharpe_ratio": round(calculate_sharpe_ratio(prices), 4),
                "period": period,
            }
        except Exception as exc:
            logger.warning("get_risk_metrics failed for %s: %s", ticker, exc)
            errors.append({"ticker": ticker, "error": str(exc)})

    return {
        "_tool": "get_risk_metrics",
        "chart_type": "risk",
        "metrics": metrics,
        "errors": errors,
    }


@tool("get_weighted_portfolio_metrics", args_schema=_WeightedInput)
def get_weighted_portfolio_metrics(
    tickers: list[str],
    weights: list[float],
    exchange: str = "NSE",
    period: str = "1y",
) -> dict:
    """
    Calculate blended, weight-adjusted portfolio-level metrics from historical data.
    Returns CAGR, total return, volatility, Sharpe ratio, VaR, and max drawdown for
    the overall portfolio (not individual stocks), accounting for position weights.
    Call this when the user asks about overall portfolio performance or wants a
    single combined view of all their holdings.
    """
    if len(tickers) != len(weights):
        return {"_tool": "get_weighted_portfolio_metrics", "error": "tickers and weights must be the same length."}

    # Normalise weights to sum to 1.0
    total_w = sum(weights)
    norm_weights = [w / total_w for w in weights] if abs(total_w - 1.0) > 0.01 else weights

    exch = Exchange.NSE if exchange.upper() == "NSE" else Exchange.BSE
    price_map: dict[str, pd.Series] = {}
    proxy_tickers: list[str] = []
    errors: list[dict] = []

    for ticker in tickers:
        try:
            df = fetch_historical_prices(ticker, exch, period, "1d")
            price_map[ticker] = df["Close"].dropna()
        except Exception as exc:
            logger.warning(
                "get_weighted_portfolio_metrics: no live data for %s (%s) — using cash proxy",
                ticker, exc,
            )
            proxy_tickers.append(ticker)
            errors.append({"ticker": ticker, "error": str(exc), "proxy": "cash"})

    if not price_map:
        return {
            "_tool": "get_weighted_portfolio_metrics",
            "error": "Could not fetch live price data for any ticker.",
            "errors": errors,
        }

    # Align on common trading days from tickers that returned live data
    price_df = pd.DataFrame(price_map).dropna()
    if price_df.empty:
        return {
            "_tool": "get_weighted_portfolio_metrics",
            "error": "No overlapping trading days found for the provided tickers.",
            "errors": errors,
        }

    # Fill failed tickers with a constant 1.0 series (zero-return cash proxy)
    for ticker in proxy_tickers:
        price_df[ticker] = 1.0

    available = [t for t in tickers if t in price_df.columns]
    w_map = {t: w for t, w in zip(tickers, norm_weights) if t in available}
    w_vec = [w_map[t] for t in available]

    # Daily returns → weighted portfolio return series
    daily_returns = price_df[available].pct_change().dropna()
    port_returns = (daily_returns * w_vec).sum(axis=1)

    # Synthetic portfolio price series (rebased to 100)
    port_prices: pd.Series = (1 + port_returns).cumprod() * 100

    portfolio_metrics: dict[str, Any] = {
        "cagr_pct": round(calculate_cagr(port_prices) * 100, 2),
        "total_return_pct": round(calculate_total_return(port_prices) * 100, 2),
        "annualized_volatility_pct": round(
            calculate_annualized_volatility(port_prices) * 100, 2
        ),
        "var_95_pct": round(calculate_var_95(port_prices) * 100, 2),
        "max_drawdown_pct": round(calculate_max_drawdown(port_prices) * 100, 2),
        "sharpe_ratio": round(calculate_sharpe_ratio(port_prices), 4),
        "tickers_used": available,
        "weights_used": [round(w, 4) for w in w_vec],
        "period": period,
    }

    return {
        "_tool": "get_weighted_portfolio_metrics",
        "chart_type": "comparison",
        "metrics": portfolio_metrics,
        "errors": errors,
    }


def _build_weighted_port_prices(
    price_df: pd.DataFrame,
    weights: dict[str, float],
) -> pd.Series | None:
    """
    Build a synthetic portfolio price series (rebased to 100) from a weight map.
    Returns None if none of the tickers are present in price_df.
    """
    present = [t for t in weights if t in price_df.columns]
    if not present:
        return None

    total_w = sum(weights[t] for t in present)
    if total_w == 0:
        return None

    w_vec = [weights[t] / total_w for t in present]
    daily_returns = price_df[present].pct_change().dropna()
    port_returns = (daily_returns * w_vec).sum(axis=1)
    return (1 + port_returns).cumprod() * 100


def _metrics_from_prices(prices: pd.Series) -> dict[str, Any]:
    """Compute all portfolio-level metrics from a price series."""
    try:
        return {
            "cagr_pct":                   round(calculate_cagr(prices) * 100, 2),
            "total_return_pct":           round(calculate_total_return(prices) * 100, 2),
            "annualized_volatility_pct":  round(calculate_annualized_volatility(prices) * 100, 2),
            "var_95_pct":                 round(calculate_var_95(prices) * 100, 2),
            "max_drawdown_pct":           round(calculate_max_drawdown(prices) * 100, 2),
            "sharpe_ratio":               round(calculate_sharpe_ratio(prices), 4),
        }
    except Exception as exc:
        return {"error": str(exc)}


@tool("simulate_what_if", args_schema=_WhatIfInput)
def simulate_what_if(
    current_portfolio: list[dict],
    sell_ticker: str,
    sell_weight: float,
    buy_ticker: str,
    buy_weight: float,
    exchange: str = "NSE",
    period: str = "1y",
) -> dict:
    """
    Simulate a portfolio trade and compare Before vs After historical metrics.

    Use this tool when the user asks:
    - "What if I sell [TICKER] and buy [TICKER]?"
    - "What would happen if I swap [TICKER] for [TICKER]?"
    - "How would replacing [TICKER] with [TICKER] affect my portfolio?"

    Args:
        current_portfolio: Full portfolio from USER PORTFOLIO context:
                           [{"ticker": "RELIANCE", "weight": 0.30}, ...].
        sell_ticker:       Ticker to reduce/remove.
        sell_weight:       Weight fraction to remove from sell_ticker (0.0–1.0).
                           Use the ticker's current weight to sell the entire position.
        buy_ticker:        Ticker to add or increase (may be new or existing).
        buy_weight:        Weight fraction to allocate to buy_ticker.
                           Should equal sell_weight to keep total exposure constant.
        exchange:          "NSE" or "BSE".
        period:            yfinance backtesting period (e.g. "1y", "2y").

    Returns CAGR, Sharpe Ratio, Max Drawdown, Volatility and VaR for both
    the current portfolio ("before") and the simulated portfolio ("after"),
    plus a "delta" dict showing after − before for each metric.
    """
    sell_t = sell_ticker.strip().upper()
    buy_t  = buy_ticker.strip().upper()
    exch   = Exchange.NSE if exchange.upper() == "NSE" else Exchange.BSE

    # ── 1. Build before_weights ───────────────────────────────────────────────
    raw_before: dict[str, float] = {
        item["ticker"].strip().upper(): float(item.get("weight", 0))
        for item in current_portfolio
        if item.get("ticker")
    }
    total_b = sum(raw_before.values())
    if total_b <= 0:
        return {"_tool": "simulate_what_if", "error": "current_portfolio has zero total weight."}
    before_weights = {t: w / total_b for t, w in raw_before.items()}

    # ── 2. Build after_weights ────────────────────────────────────────────────
    after_raw = dict(before_weights)

    # Clamp sell to what is actually held
    current_sell_w = after_raw.get(sell_t, 0.0)
    actual_sell    = min(float(sell_weight), current_sell_w)
    after_raw[sell_t] = max(0.0, current_sell_w - actual_sell)

    # Add buy weight (ticker may be new)
    after_raw[buy_t] = after_raw.get(buy_t, 0.0) + float(buy_weight)

    # Drop zero-weight positions and re-normalise
    after_raw = {t: w for t, w in after_raw.items() if w > 0}
    total_a   = sum(after_raw.values())
    if total_a <= 0:
        return {"_tool": "simulate_what_if", "error": "After-trade portfolio has zero total weight."}
    after_weights = {t: w / total_a for t, w in after_raw.items()}

    # ── 3. Fetch price data for ALL unique tickers ────────────────────────────
    all_tickers = list(set(list(before_weights.keys()) + list(after_weights.keys())))
    price_map: dict[str, pd.Series] = {}
    proxy_tickers_wi: list[str] = []
    errors: list[dict] = []

    for ticker in all_tickers:
        try:
            df = fetch_historical_prices(ticker, exch, period, "1d")
            price_map[ticker] = df["Close"].dropna()
        except Exception as exc:
            logger.warning(
                "simulate_what_if: no live data for %s (%s) — using cash proxy", ticker, exc,
            )
            proxy_tickers_wi.append(ticker)
            errors.append({"ticker": ticker, "error": str(exc), "proxy": "cash"})

    if not price_map:
        return {
            "_tool": "simulate_what_if",
            "error": "Could not fetch live price data for any ticker.",
            "errors": errors,
        }

    # ── 4. Align to common trading days ──────────────────────────────────────
    price_df = pd.DataFrame(price_map).dropna()

    # Fill failed tickers with a constant 1.0 series (zero-return cash proxy)
    for ticker in proxy_tickers_wi:
        price_df[ticker] = 1.0

    if len(price_df) < 22:
        return {
            "_tool": "simulate_what_if",
            "error": f"Only {len(price_df)} common trading days found — need at least 22.",
            "errors": errors,
        }

    # ── 5. Compute metrics for BEFORE and AFTER ───────────────────────────────
    before_prices = _build_weighted_port_prices(price_df, before_weights)
    after_prices  = _build_weighted_port_prices(price_df, after_weights)

    if before_prices is None or after_prices is None:
        return {
            "_tool": "simulate_what_if",
            "error": "No overlap between portfolio tickers and available price data.",
            "errors": errors,
        }

    before_metrics = _metrics_from_prices(before_prices)
    after_metrics  = _metrics_from_prices(after_prices)

    # ── 6. Compute delta (after − before) ─────────────────────────────────────
    NUMERIC_KEYS = [
        "cagr_pct", "sharpe_ratio", "max_drawdown_pct",
        "annualized_volatility_pct", "var_95_pct",
    ]
    delta = {
        k: round(after_metrics[k] - before_metrics[k], 4)
        for k in NUMERIC_KEYS
        if k in before_metrics and k in after_metrics
        and "error" not in before_metrics and "error" not in after_metrics
    }

    # Surface tickers + weights used
    before_metrics["tickers"] = [t for t in before_weights if t in price_df.columns]
    after_metrics["tickers"]  = [t for t in after_weights  if t in price_df.columns]

    return {
        "_tool":      "simulate_what_if",
        "chart_type": "whatif",
        "before":     before_metrics,
        "after":      after_metrics,
        "delta":      delta,
        "trade": {
            "sell_ticker": sell_t,
            "sell_weight": round(actual_sell, 4),
            "buy_ticker":  buy_t,
            "buy_weight":  round(float(buy_weight), 4),
        },
        "common_days": len(price_df),
        "errors":      errors,
    }


# ── Tools list (must be defined before LLM binding) ───────────────────────────

_TOOLS = [
    get_performance_metrics,
    get_risk_metrics,
    get_weighted_portfolio_metrics,
    simulate_what_if,
]


# ── LLM-free portfolio fallback ────────────────────────────────────────────────

def _compute_portfolio_metrics_direct(
    portfolio: list[dict],
    exchange: str = "NSE",
    period: str = "1y",
) -> dict[str, Any] | None:
    """
    Compute weighted portfolio metrics directly, without invoking the LLM.

    This is the safety net called when the LangGraph agent fails for any reason
    (missing API key, Groq rate limit, network error, graph crash).  It fetches
    live yfinance data using the same SSL-bypass session as the rest of the
    codebase, builds a weighted price series, and returns a chart_data dict
    shaped for chart_type='comparison'.

    Returns None only if BOTH the LLM AND yfinance are unavailable — in which
    case the caller should surface an explicit error rather than showing stale
    mock data.
    """
    if not portfolio:
        return None

    exch = Exchange.NSE if exchange.upper() == "NSE" else Exchange.BSE

    tickers     = [item["ticker"].strip().upper() for item in portfolio if item.get("ticker")]
    raw_weights = [float(item.get("weight", 0)) for item in portfolio if item.get("ticker")]

    if not tickers:
        return None

    total_w = sum(raw_weights)
    if total_w <= 0:
        return None
    norm_weights = [w / total_w for w in raw_weights]

    price_map: dict[str, pd.Series] = {}
    proxy_tickers: list[str] = []
    errors: list[dict] = []

    for ticker in tickers:
        try:
            df = fetch_historical_prices(ticker, exch, period, "1d")
            price_map[ticker] = df["Close"].dropna()
        except Exception as exc:
            logger.warning(
                "_compute_portfolio_metrics_direct: no live data for %s: %s", ticker, exc
            )
            proxy_tickers.append(ticker)
            errors.append({"ticker": ticker, "error": str(exc)})

    if not price_map:
        logger.error(
            "_compute_portfolio_metrics_direct: could not fetch live data for "
            "ANY ticker in %s — fallback also failed.", tickers
        )
        return None

    # Align on common trading days; fill failed tickers with zero-return proxy
    price_df = pd.DataFrame(price_map).dropna()
    for ticker in proxy_tickers:
        price_df[ticker] = 1.0

    if len(price_df) < 22:
        logger.error(
            "_compute_portfolio_metrics_direct: only %d overlapping trading days "
            "(need ≥ 22). Cannot compute reliable metrics.", len(price_df)
        )
        return None

    available = [t for t in tickers if t in price_df.columns]
    w_map     = {t: w for t, w in zip(tickers, norm_weights) if t in available}
    w_vec     = [w_map[t] for t in available]

    # Weighted portfolio price series (rebased to 100)
    daily_returns = price_df[available].pct_change().dropna()
    port_returns  = (daily_returns * w_vec).sum(axis=1)
    port_prices: pd.Series = (1 + port_returns).cumprod() * 100

    try:
        portfolio_metrics: dict[str, Any] = {
            "cagr_pct":                  round(calculate_cagr(port_prices) * 100, 2),
            "total_return_pct":          round(calculate_total_return(port_prices) * 100, 2),
            "annualized_volatility_pct": round(calculate_annualized_volatility(port_prices) * 100, 2),
            "var_95_pct":                round(calculate_var_95(port_prices) * 100, 2),
            "max_drawdown_pct":          round(calculate_max_drawdown(port_prices) * 100, 2),
            "sharpe_ratio":              round(calculate_sharpe_ratio(port_prices), 4),
            "tickers_used":  available,
            "weights_used":  [round(w, 4) for w in w_vec],
            "period":        period,
        }
    except Exception as exc:
        logger.exception(
            "_compute_portfolio_metrics_direct: metric computation failed: %s", exc
        )
        return None

    logger.info(
        "_compute_portfolio_metrics_direct: computed metrics for %d tickers "
        "(%d trading days). CAGR=%.2f%% Total Return=%.2f%%",
        len(available), len(price_df),
        portfolio_metrics["cagr_pct"],
        portfolio_metrics["total_return_pct"],
    )
    return {
        "portfolio": portfolio_metrics,
        "errors":    errors,
    }


# ── System Prompt ──────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a professional Indian stock market portfolio analyst powered by quantitative tools.

AVAILABLE TOOLS:
• get_performance_metrics           – CAGR, total return, volatility per stock
• get_risk_metrics                  – VaR (95%), max drawdown, Sharpe ratio per stock
• get_weighted_portfolio_metrics    – blended portfolio-level metrics (use weights from context)
• simulate_what_if                  – "Before vs After" simulation for a proposed trade

RULES:
1. Always call at least one tool before answering any portfolio question.
2. Extract tickers and exchange directly from the USER PORTFOLIO provided in context.
3. For overall-portfolio questions, use get_weighted_portfolio_metrics with ALL tickers and weights.
4. For per-stock questions, call the appropriate single-ticker tool.
5. You may call multiple tools in the same turn if the question requires both performance and risk.
6. After tools return, give a concise, actionable insight (2–4 sentences). No markdown, no bullet lists.
7. Quote specific numbers from tool results. NEVER fabricate metrics.

WHAT-IF SIMULATION RULES:
8. When the user asks "what if I sell X and buy Y" or any variation (swap, replace, trade),
   call simulate_what_if — NOT the other tools.
9. Pass the FULL portfolio from context as current_portfolio.
10. Set sell_weight to the sell_ticker's current weight to sell the full position,
    or to the fraction explicitly stated by the user.
11. Set buy_weight equal to sell_weight unless the user specifies otherwise.
12. After the tool returns, explain the delta in plain English:
    - State CAGR change (e.g. "+1.2% improvement in CAGR"),
    - State Sharpe change (improvement = higher is better),
    - State Max Drawdown change (improvement = less negative is better),
    - Give a one-sentence verdict: is the trade worth making?

SUGGESTIONS RULE:
13. At the very end of your response, on its own line, output exactly this JSON with no extra text after it:
{"suggestions":["<question 1>","<question 2>","<question 3>"]}
The three questions must be short, specific follow-ups a user might naturally ask next given the context."""


# ── Graph Nodes ────────────────────────────────────────────────────────────────

def _agent_node(state: PortfolioAgentState) -> dict:
    """Invoke the LLM with the portfolio context injected as the system message."""
    portfolio_ctx = json.dumps(state["portfolio"], indent=2)
    system = SystemMessage(
        content=(
            f"{_SYSTEM_PROMPT}\n\n"
            f"USER PORTFOLIO (tickers + weights):\n{portfolio_ctx}\n"
            f"Exchange: {state['exchange']}  |  Period: {state['period']}"
        )
    )
    try:
        response = _get_llm_with_tools().invoke([system] + state["messages"])
    except Exception as exc:
        if _is_rate_limit_error(exc):
            # HTTP 429 — Groq daily / per-minute quota exhausted.
            # Embed the rate-limit marker so Phase 4 of run_agent() routes to
            # _agent_fallback() with the correct user-facing message.
            logger.warning(
                "Groq 429 rate limit hit in _agent_node — "
                "routing to yfinance fallback. Detail: %s", exc,
            )
            response = AIMessage(content=_RATE_LIMIT_MARKER)
        else:
            logger.exception("LLM invocation failed in _agent_node: %s", exc)
            # Return a plain AIMessage so the graph exits cleanly without tool calls.
            # run_agent will detect the empty tool_outputs and engage the direct
            # portfolio metrics fallback.
            response = AIMessage(
                content=(
                    "I'm having trouble connecting to the AI service right now. "
                    "Please check your API key and try again."
                )
            )
    return {"messages": [response]}


def _should_continue(
    state: PortfolioAgentState,
) -> Literal["tools", "format_response"]:
    last = state["messages"][-1]
    if isinstance(last, AIMessage) and getattr(last, "tool_calls", None):
        return "tools"
    return "format_response"


def _format_response_node(state: PortfolioAgentState) -> dict:
    """
    Scan all ToolMessages in the conversation and accumulate their payloads
    into tool_outputs so run_agent() can build the structured response.
    """
    accumulated: dict[str, Any] = dict(state.get("tool_outputs") or {})

    for msg in state["messages"]:
        if not isinstance(msg, ToolMessage):
            continue
        # ToolNode serialises dict returns as JSON strings
        raw = msg.content
        try:
            data: Any = json.loads(raw) if isinstance(raw, str) else raw
        except (json.JSONDecodeError, TypeError):
            data = {"raw": str(raw)}

        # Prefer the explicit _tool key; fall back to msg.name
        tool_name: str = (
            data.get("_tool") if isinstance(data, dict) else None
        ) or msg.name or "unknown"
        accumulated[tool_name] = data

    return {"tool_outputs": accumulated}


# ── Graph Assembly ─────────────────────────────────────────────────────────────

def _build_graph():
    tool_node = ToolNode(_TOOLS)

    g = StateGraph(PortfolioAgentState)
    g.add_node("agent", _agent_node)
    g.add_node("tools", tool_node)
    g.add_node("format_response", _format_response_node)

    g.add_edge(START, "agent")
    g.add_conditional_edges("agent", _should_continue)
    g.add_edge("tools", "agent")
    g.add_edge("format_response", END)

    return g.compile()


_GRAPH: Any = None  # lazy init to defer API-key validation until first use


def _get_graph():
    global _GRAPH
    if _GRAPH is None:
        _GRAPH = _build_graph()
    return _GRAPH


# ── Public Response Model ──────────────────────────────────────────────────────

class AgentResponse(BaseModel):
    """Structured response returned by run_agent / run_agent_async."""

    message: str
    """The AI's conversational reply, safe to render directly in chat UI."""

    chart_type: Literal["performance", "risk", "comparison", "whatif", "none"]
    """
    Which frontend chart view to activate:
      performance – CAGR / return / volatility bars
      risk        – VaR / drawdown / Sharpe bars
      comparison  – weighted portfolio summary card + all-metrics table
      none        – no chart (general question or no tools called)
    """

    chart_data: dict[str, Any] | None
    """
    Metric payload for the active chart view.

    Shape when chart_type == "performance" or "risk":
      {
        "per_ticker": { "TICKER": { ...metrics... }, ... },
        "errors":     [{"ticker": ..., "error": ...}]
      }

    Shape when chart_type == "comparison":
      {
        "portfolio": { ...blended metrics... },
        "errors":    [...]
      }

    If multiple tools were called, all payloads are merged under their
    respective keys ("performance", "risk", "portfolio").
    """

    suggestions: list[str] = []
    """3 contextual follow-up questions for the chat UI to display as suggestion chips."""


# ── Chart-data Assembly Helpers ────────────────────────────────────────────────

# Priority order determines chart_type when multiple tools fired
_TOOL_PRIORITY: list[str] = [
    "simulate_what_if",
    "get_weighted_portfolio_metrics",
    "get_risk_metrics",
    "get_performance_metrics",
]

_TOOL_TO_CHART_TYPE: dict[str, str] = {
    "simulate_what_if":              "whatif",
    "get_weighted_portfolio_metrics": "comparison",
    "get_risk_metrics":               "risk",
    "get_performance_metrics":        "performance",
}

_TOOL_TO_FRIENDLY_KEY: dict[str, str] = {
    "simulate_what_if":              "what_if",
    "get_weighted_portfolio_metrics": "portfolio",
    "get_risk_metrics":               "risk",
    "get_performance_metrics":        "performance",
}

# Phrases that indicate the LLM failed to invoke any tools (key / network issue).
# The _RATE_LIMIT_MARKER entry ensures HTTP 429 responses are caught by Phase 4.
_LLM_FAILURE_PHRASES = (
    "trouble connecting",
    "api service",
    "api key",
    "can't process",
    "cannot process",
    "error while analysing",
    "encountered an error",
    _RATE_LIMIT_MARKER,   # "__groq_rate_limit__" — emitted by _agent_node on HTTP 429
)


def _assemble_chart_data(
    tool_outputs: dict[str, Any],
) -> tuple[str, dict[str, Any] | None]:
    """
    Build (chart_type, chart_data) from the raw tool_outputs dict.
    """
    if not tool_outputs:
        return "none", None

    # Determine dominant chart_type by priority
    chart_type = "none"
    for tool_name in _TOOL_PRIORITY:
        if tool_name in tool_outputs:
            chart_type = _TOOL_TO_CHART_TYPE[tool_name]
            break

    chart_data: dict[str, Any] = {}
    all_errors: list[dict] = []

    for tool_name, data in tool_outputs.items():
        if not isinstance(data, dict):
            continue

        if tool_name == "simulate_what_if":
            chart_data["what_if"] = {
                "before": data.get("before"),
                "after":  data.get("after"),
                "delta":  data.get("delta"),
                "trade":  data.get("trade"),
                "common_days": data.get("common_days"),
            }
        elif tool_name == "get_weighted_portfolio_metrics":
            chart_data["portfolio"] = data.get("metrics")
        else:
            raw_metrics = data.get("metrics")
            chart_data["per_ticker"] = chart_data.get("per_ticker") or {}
            if isinstance(raw_metrics, dict):
                chart_data["per_ticker"].update(raw_metrics)
            key = _TOOL_TO_FRIENDLY_KEY.get(tool_name, tool_name)
            chart_data[key] = raw_metrics

        all_errors.extend(data.get("errors", []))

    if all_errors:
        chart_data["errors"] = all_errors

    return chart_type, chart_data


# ── Single-stock query fast-path ──────────────────────────────────────────────
#
# When the portfolio has ≤ 1 holding (or is empty but a ticker is named in the
# message), we bypass LangGraph entirely.  Multi-ticker covariance math (used
# by get_weighted_portfolio_metrics and simulate_what_if) requires ≥ 2 tickers
# with aligned trading-day histories; running it on a single asset raises
# ValueError / produces degenerate results that crash the frontend canvas.
#
# Instead we:
#   1. Extract the named ticker from the portfolio or the message.
#   2. Call fetch_historical_prices() directly — same SSL session as the rest
#      of the codebase.
#   3. Compute all six metrics (CAGR, total return, volatility, VaR, MDD,
#      Sharpe) individually so no single failure blocks the others.
#   4. Inject the live numbers into the LLM system prompt inside a clearly
#      delimited "INJECTED LIVE DATA FOR CURRENT QUERY" block.
#   5. Call the plain (no-tools-bound) LLM so it answers from the injected
#      data without triggering any tool call that could raise a KeyError or
#      ValueError deep inside the graph.
#   6. Always return chart_type='comparison' with a valid chart_data payload
#      so the frontend canvas never goes blank or rolls back to mock data.

# ---------------------------------------------------------------------------
# Well-known NSE / BSE tickers used for message scanning when the portfolio
# is empty.  Longest-match wins so "HDFCBANK" beats "HDFC".
# ---------------------------------------------------------------------------
_KNOWN_TICKERS: frozenset[str] = frozenset({
    # Nifty 50 (current)
    "ADANIPORTS", "ASIANPAINT", "AXISBANK", "BAJAJ-AUTO", "BAJAJFINSV",
    "BAJFINANCE", "BHARTIARTL", "BPCL", "BRITANNIA", "CIPLA",
    "COALINDIA", "DRREDDY", "EICHERMOT", "GRASIM", "HCLTECH",
    "HDFC", "HDFCBANK", "HDFCLIFE", "HEROMOTOCO", "HINDALCO",
    "HINDUNILVR", "ICICIBANK", "INDUSINDBK", "INFY", "ITC",
    "JSWSTEEL", "KOTAKBANK", "LT", "MARUTI", "NESTLEIND",
    "NTPC", "ONGC", "POWERGRID", "RELIANCE", "SBILIFE",
    "SBIN", "SHREECEM", "SUNPHARMA", "TATACONSUM", "TATAMOTORS",
    "TATASTEEL", "TCS", "TECHM", "TITAN", "ULTRACEMCO", "UPL", "WIPRO",
    # Widely traded mid-caps and popular names
    "ZOMATO", "NYKAA", "PAYTM", "DMART", "IRCTC", "IRFC",
    "ADANIENT", "ADANIGREEN", "ADANIPOWER", "ADANITRANS",
    "TATAPOWER", "TATACHEM", "TATACOMM",
    "BANKBARODA", "PNB", "CANBK", "UNIONBANK", "IDFCFIRSTB",
    "FEDERALBNK", "RBLBANK", "INDUSIND",
    "PIDILITIND", "DABUR", "MARICO", "GODREJCP", "COLPAL",
    "RECLTD", "PFC", "NHPC", "SJVN",
    "HAL", "BEL", "BHEL",
    "APOLLOHOSP", "FORTIS", "ALKEM", "AUROPHARMA",
    "DIVISLAB", "BIOCON", "TORNTPHARM", "LUPIN",
    "INTERGLOBE", "AMBUJACEM", "ACC",
    "VEDL", "HINDZINC", "NATIONALUM",
    "SAIL", "JINDALSTEL",
    "SBICARD", "CHOLAFIN", "LICHSGFIN", "MUTHOOTFIN",
    "LTI", "LTTS", "MPHASIS", "COFORGE", "PERSISTENT", "OFSS",
    "MOTHERSUMI", "APOLLOTYRE", "MRF",
})


def _extract_ticker_from_message(user_message: str) -> str | None:
    """
    Scan *user_message* for a recognisable NSE/BSE ticker.

    Search order (first match wins):
      1. Explicit Yahoo Finance exchange suffix (.NS / .BO) — unambiguous.
      2. Longest match from *_KNOWN_TICKERS* at a word boundary.

    Returns the bare ticker symbol (no exchange suffix), or None.
    """
    msg_upper = user_message.upper()

    # Priority 1: explicit YF suffix is unambiguous
    for m in re.finditer(r'\b([A-Z][A-Z0-9\-]{1,12})\.(NS|BO)\b', msg_upper):
        return m.group(1)

    # Priority 2: known ticker at word boundary; longest match wins so
    # "HDFCBANK" is preferred over the shorter "HDFC" when both match.
    matched: list[str] = [
        t for t in _KNOWN_TICKERS
        if re.search(r'\b' + re.escape(t) + r'\b', msg_upper)
    ]
    return max(matched, key=len) if matched else None


def _is_single_stock_query(
    user_message: str,
    portfolio: list[dict],
) -> tuple[bool, str | None]:
    """
    Return *(True, bare_ticker)* when the request qualifies for the
    single-stock fast-path:

    • portfolio has exactly 1 holding  →  that ticker is used directly.
    • portfolio is empty AND the message names a recognisable ticker.

    For portfolios with ≥ 2 holdings the full LangGraph agent always runs
    so legitimate multi-stock queries are never short-circuited.
    """
    if len(portfolio) == 1:
        raw  = portfolio[0].get("ticker", "").strip().upper()
        # sanitize_ticker strips :NSE/:BSE qualifiers, removes .NS/.BO, and
        # applies alias rewrites (e.g. "HDFC" → "HDFCBANK") so the ticker
        # returned here matches exactly what yfinance will be asked to fetch.
        bare = sanitize_ticker(raw)
        return (True, bare) if bare else (False, None)

    if len(portfolio) == 0:
        ticker = _extract_ticker_from_message(user_message)
        if ticker:
            return True, ticker

    return False, None


def _fetch_single_stock_metrics(
    ticker: str,
    exchange: str = "NSE",
    period: str = "1y",
) -> dict[str, Any]:
    """
    Fetch live historical prices for *ticker* and compute all key metrics.

    Reuses *fetch_historical_prices()* (from portfolio_math) so the same
    SSL session, double-suffix guard, and error handling are applied.

    Each metric computation is wrapped individually so one failure (e.g.
    insufficient bars for VaR) never prevents the others from being returned.

    Returns a flat dict; values are None when a metric cannot be computed.
    Raises ValueError only when yfinance returns empty / no data at all.
    """
    # Resolve through alias map first so the dict label matches the symbol
    # that yfinance actually fetches (e.g. "HDFC" → "HDFCBANK").
    ticker = sanitize_ticker(ticker)
    exch = Exchange.NSE if exchange.upper() == "NSE" else Exchange.BSE
    df     = fetch_historical_prices(ticker, exch, period, "1d")
    prices: pd.Series = df["Close"].dropna()

    if len(prices) < 2:
        raise ValueError(
            f"Only {len(prices)} price bar(s) returned for '{ticker}' "
            f"(period={period}) — cannot compute metrics."
        )

    def _pct(fn, *args) -> float | None:
        """Call fn(*args), scale to percent, round to 2 d.p.; None on error."""
        try:
            return round(fn(*args) * 100, 2)
        except Exception as exc:
            logger.debug(
                "_fetch_single_stock_metrics: %s skipped for %s: %s",
                getattr(fn, "__name__", repr(fn)), ticker, exc,
            )
            return None

    def _val(fn, *args, dp: int = 4) -> float | None:
        """Call fn(*args), round to dp places; None on error."""
        try:
            return round(fn(*args), dp)
        except Exception as exc:
            logger.debug(
                "_fetch_single_stock_metrics: %s skipped for %s: %s",
                getattr(fn, "__name__", repr(fn)), ticker, exc,
            )
            return None

    return {
        "ticker":                    ticker,
        "period":                    period,
        "bars":                      len(prices),
        "latest_close":              round(float(prices.iloc[-1]), 2),
        "total_return_pct":          _pct(calculate_total_return, prices),
        "cagr_pct":                  _pct(calculate_cagr, prices),
        "annualized_volatility_pct": _pct(calculate_annualized_volatility, prices),
        "var_95_pct":                _pct(calculate_var_95, prices),
        "max_drawdown_pct":          _pct(calculate_max_drawdown, prices),
        "sharpe_ratio":              _val(calculate_sharpe_ratio, prices),
    }


def _handle_single_stock_query(
    ticker: str,
    user_message: str,
    portfolio: list[dict],
    exchange: str = "NSE",
    period: str = "1y",
) -> "AgentResponse":
    """
    Fast-path handler for single-stock (or empty-portfolio) queries.

    Bypasses LangGraph entirely:
      1. Calls fetch_historical_prices() directly for the named ticker.
      2. Injects all live metrics into an 'INJECTED LIVE DATA FOR CURRENT
         QUERY' block in the LLM system prompt so the model answers from
         real numbers without calling any tool.
      3. Calls the plain (no-tools-bound) LLM so no tool execution can
         crash with ValueError / KeyError from insufficient portfolio data.
      4. Always returns chart_type='comparison' with a fully-populated
         chart_data payload so the frontend canvas never goes blank.
    """
    # Resolve through alias map so labels, logs, and chart_data all reflect
    # the canonical symbol that yfinance actually fetches.
    # e.g. "HDFC" → "HDFCBANK", "INFY:NSE" → "INFY"
    ticker = sanitize_ticker(ticker)

    logger.info(
        "_handle_single_stock_query: ticker=%s exchange=%s period=%s",
        ticker, exchange, period,
    )

    # ── 1. Fetch live data ────────────────────────────────────────────────────
    stock_data: dict[str, Any] | None = None
    fetch_error = ""
    try:
        stock_data = _fetch_single_stock_metrics(ticker, exchange, period)
        logger.info(
            "_handle_single_stock_query: %s OK — "
            "CAGR=%s%% Vol=%s%% Close=₹%s",
            ticker,
            stock_data.get("cagr_pct"),
            stock_data.get("annualized_volatility_pct"),
            stock_data.get("latest_close"),
        )
    except Exception as exc:
        fetch_error = str(exc)
        logger.warning(
            "_handle_single_stock_query: yfinance fetch failed for %s: %s",
            ticker, exc,
        )

    # ── 2. Build chart_data (always comparison shape) ─────────────────────────
    if stock_data:
        portfolio_block: dict[str, Any] = {
            "tickers_used":              [ticker],
            "weights_used":              [1.0],
            "period":                    period,
            "cagr_pct":                  stock_data["cagr_pct"],
            "total_return_pct":          stock_data["total_return_pct"],
            "annualized_volatility_pct": stock_data["annualized_volatility_pct"],
            "var_95_pct":                stock_data["var_95_pct"],
            "max_drawdown_pct":          stock_data["max_drawdown_pct"],
            "sharpe_ratio":              stock_data["sharpe_ratio"],
            "latest_close":              stock_data["latest_close"],
        }
        chart_data: dict[str, Any] = {
            "portfolio":    portfolio_block,
            "single_stock": stock_data,
            "errors":       [],
        }
    else:
        chart_data = {
            "portfolio": {
                "tickers_used": [ticker],
                "weights_used": [1.0],
                "period":       period,
                "error":        fetch_error or f"Could not fetch live data for {ticker}",
            },
            "errors": [{"ticker": ticker, "error": fetch_error or "yfinance fetch failed"}],
        }

    # ── 3. Build INJECTED LIVE DATA block for the system prompt ───────────────
    if stock_data:
        def _fmt(v, fmt="+.2f", suffix="%") -> str:
            return f"{v:{fmt}}{suffix}" if v is not None else "N/A"

        lines = [
            "",
            "--- INJECTED LIVE DATA FOR CURRENT QUERY ---",
            f"Ticker          : {ticker}",
            f"Exchange        : {exchange}",
            f"Period          : {period}",
            f"Price Bars      : {stock_data['bars']}",
            f"Latest Close    : ₹{stock_data['latest_close']:,.2f}",
            f"1Y Total Return : {_fmt(stock_data['total_return_pct'])}",
            f"CAGR            : {_fmt(stock_data['cagr_pct'])}",
            f"Ann. Volatility : {_fmt(stock_data['annualized_volatility_pct'], '.2f')}",
            f"VaR (95%, 1d)   : {_fmt(stock_data['var_95_pct'])}",
            f"Max Drawdown    : {_fmt(stock_data['max_drawdown_pct'])}",
            f"Sharpe Ratio    : {str(stock_data['sharpe_ratio']) if stock_data['sharpe_ratio'] is not None else 'N/A'}",
            "--- END INJECTED DATA ---",
        ]
        injected_block = "\n".join(lines)
        tool_instruction = (
            "\nIMPORTANT: The live data above has already been fetched — "
            "do NOT call any tools. Answer the user using ONLY the injected numbers. "
            "Quote exact figures. Give a concise 2–4 sentence insight. "
            "End with the suggestions JSON on its own line."
        )
    else:
        injected_block = (
            "\n--- INJECTED LIVE DATA FOR CURRENT QUERY ---\n"
            f"Ticker: {ticker}  |  Status: UNAVAILABLE\n"
            f"Reason: {fetch_error or 'yfinance could not fetch data for this ticker'}\n"
            "--- END INJECTED DATA ---"
        )
        tool_instruction = (
            "\nIMPORTANT: Live data is unavailable for this ticker. "
            "Politely inform the user and suggest verifying the symbol on Yahoo Finance "
            f"(https://finance.yahoo.com/quote/{ticker}.NS)."
        )

    system_content = (
        f"{_SYSTEM_PROMPT}\n\n"
        f"USER PORTFOLIO (tickers + weights):\n"
        f"{json.dumps(portfolio, indent=2)}\n"
        f"Exchange: {exchange}  |  Period: {period}"
        f"{injected_block}"
        f"{tool_instruction}"
    )

    # ── 4. Call plain LLM (no tools bound) ───────────────────────────────────
    ai_text = ""
    try:
        plain_llm = _build_llm()
        response  = plain_llm.invoke([
            SystemMessage(content=system_content),
            HumanMessage(content=user_message),
        ])
        ai_text = (
            response.content
            if isinstance(response.content, str)
            else str(response.content)
        ).strip()
    except Exception as exc:
        if _is_rate_limit_error(exc):
            # HTTP 429 — return the mandated rate-limit copy; live chart_data
            # computed from yfinance is still returned so the canvas is populated.
            logger.warning(
                "_handle_single_stock_query: Groq 429 rate limit for %s: %s",
                ticker, exc,
            )
            ai_text = (
                "Groq API Rate Limit reached. "
                "Displaying live calculated market returns directly."
            )
        else:
            logger.warning(
                "_handle_single_stock_query: LLM call failed for %s: %s", ticker, exc
            )
            # Construct a plain-text fallback so the response is never empty
            if stock_data:
                ai_text = (
                    f"{ticker} has delivered a "
                    f"{stock_data['total_return_pct']:+.2f}% total return "
                    f"({stock_data['cagr_pct']:+.2f}% CAGR) over the past {period}. "
                    f"Annualized volatility: "
                    f"{stock_data.get('annualized_volatility_pct') or 'N/A'}%. "
                    f"Latest close: ₹{stock_data['latest_close']:,.2f}."
                )
            else:
                ai_text = (
                    f"I couldn't fetch live market data for {ticker} right now. "
                    "Please verify the ticker symbol and try again."
                )

    # ── 5. Strip trailing suggestions JSON ───────────────────────────────────
    suggestions: list[str] = []
    lines_text = ai_text.splitlines()
    for i in range(len(lines_text) - 1, -1, -1):
        stripped = lines_text[i].strip()
        if not stripped:
            continue
        if stripped.startswith('{"suggestions"'):
            try:
                parsed      = json.loads(stripped)
                suggestions = [str(q) for q in parsed.get("suggestions", [])][:3]
                ai_text     = "\n".join(lines_text[:i]).strip()
            except (json.JSONDecodeError, KeyError):
                pass
        break

    if not suggestions:
        suggestions = [
            f"What is {ticker}'s Sharpe ratio?",
            f"How has {ticker} performed vs Nifty 50?",
            f"What is the maximum drawdown for {ticker}?",
        ]

    return AgentResponse(
        message=ai_text or f"Here are the live metrics for {ticker}.",
        chart_type="comparison",
        chart_data=chart_data,
        suggestions=suggestions,
    )


# ── Public API ─────────────────────────────────────────────────────────────────

def run_agent(
    user_message: str,
    portfolio: list[dict],
    chat_history: list[dict] | None = None,
    exchange: str = "NSE",
    period: str = "1y",
) -> AgentResponse:
    """
    Run the portfolio analysis agent synchronously.

    Failure contract
    ----------------
    If the LangGraph graph OR the LLM throws any exception, the function:
      1. Logs the full exception (visible in docker logs).
      2. Calls _compute_portfolio_metrics_direct() to fetch live yfinance data
         and compute weighted portfolio metrics without the LLM.
      3. Returns AgentResponse(chart_type='comparison', chart_data=<real metrics>)
         so the frontend canvas shows live numbers instead of mock data.
      4. If yfinance also fails, returns a minimal error response (chart_type='none').

    Args:
        user_message:  The user's latest natural language question.
        portfolio:     List of {"ticker": str, "weight": float} dicts.
        chat_history:  Prior conversation turns.
        exchange:      "NSE" (default) or "BSE".
        period:        yfinance period string.

    Returns:
        AgentResponse(message, chart_type, chart_data, suggestions)
    """
    # Build message list from history + current message
    messages: list[BaseMessage] = []
    for turn in (chat_history or []):
        role    = turn.get("role", "")
        content = turn.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))

    messages.append(HumanMessage(content=user_message))

    initial: PortfolioAgentState = {
        "messages":    messages,
        "portfolio":   portfolio,
        "exchange":    exchange,
        "period":      period,
        "tool_outputs": {},
    }

    # ── Phase 0: Single-stock fast-path ───────────────────────────────────────
    # When portfolio ≤ 1 item (or empty with a named ticker), bypass LangGraph
    # entirely.  Portfolio-level covariance math requires ≥ 2 aligned price
    # series; running it on a single asset raises ValueError / KeyError and
    # causes the frontend canvas to revert to blank / mock data.
    is_single, single_ticker = _is_single_stock_query(user_message, portfolio)
    if is_single and single_ticker:
        logger.info(
            "run_agent: single-stock fast-path triggered — "
            "ticker=%s portfolio_size=%d",
            single_ticker, len(portfolio),
        )
        return _handle_single_stock_query(
            ticker=single_ticker,
            user_message=user_message,
            portfolio=portfolio,
            exchange=exchange,
            period=period,
        )

    # ── Phase 1: Run the LangGraph agent ──────────────────────────────────────
    final: PortfolioAgentState | None = None
    graph_error: str | None = None

    try:
        final = _get_graph().invoke(initial)
    except Exception as exc:
        graph_error = f"{type(exc).__name__}: {exc}"
        logger.exception(
            "LangGraph graph execution failed — will fall back to direct "
            "portfolio computation. Error: %s", exc
        )

    # ── Phase 2: If graph itself crashed, use direct fallback immediately ──────
    if final is None:
        return _agent_fallback(
            portfolio=portfolio,
            exchange=exchange,
            period=period,
            error_context=graph_error or "LangGraph graph returned None",
        )

    # ── Phase 3: Extract AI text from the completed graph ─────────────────────
    ai_text = ""
    for msg in reversed(final["messages"]):
        if isinstance(msg, AIMessage):
            content = msg.content
            text = (
                content if isinstance(content, str) else (
                    next(
                        (b.get("text", "") for b in content
                         if isinstance(b, dict) and b.get("type") == "text"),
                        "",
                    )
                    if isinstance(content, list)
                    else str(content)
                )
            )
            if text.strip():
                ai_text = text.strip()
                break

    # ── Phase 4: Detect LLM failure hidden inside the graph ───────────────────
    # When _agent_node catches an LLM exception it emits a plain AIMessage
    # (no tool calls).  tool_outputs will therefore be empty.  We detect this
    # by checking for known error phrases in the AI text so we don't
    # accidentally suppress a legitimate "no chart needed" conversational reply.
    tool_outputs = final.get("tool_outputs") or {}
    chart_type, chart_data = _assemble_chart_data(tool_outputs)

    llm_error_detected = (
        not tool_outputs                         # no tools ran
        and bool(ai_text)                        # but there IS a message
        and any(
            phrase in ai_text.lower()
            for phrase in _LLM_FAILURE_PHRASES
        )
    )

    if llm_error_detected and portfolio:
        logger.warning(
            "LLM returned an error message without calling any tools — "
            "engaging direct portfolio metrics fallback. LLM said: %.120s",
            ai_text,
        )
        return _agent_fallback(
            portfolio=portfolio,
            exchange=exchange,
            period=period,
            error_context=ai_text,
        )

    # ── Phase 5: Normal path — strip suggestions JSON and return ──────────────
    suggestions: list[str] = []
    lines = ai_text.splitlines()
    for i in range(len(lines) - 1, -1, -1):
        stripped = lines[i].strip()
        if not stripped:
            continue
        if stripped.startswith('{"suggestions"'):
            try:
                parsed = json.loads(stripped)
                suggestions = [str(q) for q in parsed.get("suggestions", [])][:3]
                ai_text = "\n".join(lines[:i]).strip()
            except (json.JSONDecodeError, KeyError):
                pass
        break  # Only inspect the last non-empty line

    return AgentResponse(
        message=ai_text or "I was unable to generate a response. Please try again.",
        chart_type=chart_type,  # type: ignore[arg-type]
        chart_data=chart_data,
        suggestions=suggestions,
    )


def _agent_fallback(
    portfolio: list[dict],
    exchange: str,
    period: str,
    error_context: str,
) -> AgentResponse:
    """
    LLM-free fallback: compute weighted portfolio metrics directly from yfinance
    and return them as chart_type='comparison'.

    Called when the LangGraph agent crashes or the LLM reports a failure.
    Never shows mock/static data — if yfinance also fails, returns chart_type='none'
    with an explicit error message so the operator can diagnose the root cause.
    """
    logger.info(
        "_agent_fallback: computing portfolio metrics without LLM for %d tickers.",
        len(portfolio),
    )

    fallback_data = _compute_portfolio_metrics_direct(portfolio, exchange, period)

    if fallback_data:
        tickers_used = fallback_data.get("portfolio", {}).get("tickers_used", [])
        cagr         = fallback_data.get("portfolio", {}).get("cagr_pct", 0)
        total_ret    = fallback_data.get("portfolio", {}).get("total_return_pct", 0)

        # Use the mandated rate-limit message when the failure was a Groq 429;
        # otherwise use the generic "temporarily unavailable" copy.
        if _RATE_LIMIT_MARKER in (error_context or "").lower():
            message = (
                "Groq API Rate Limit reached. "
                "Displaying live calculated market returns directly."
            )
        else:
            message = (
                "The AI analyst is temporarily unavailable, but here are your "
                f"portfolio metrics computed live from market data. "
                f"Your portfolio ({', '.join(tickers_used[:4])}"
                f"{'…' if len(tickers_used) > 4 else ''}) "
                f"has a CAGR of {cagr:+.2f}% and a total return of "
                f"{total_ret:+.2f}% over the selected period."
            )
        return AgentResponse(
            message=message,
            chart_type="comparison",
            chart_data=fallback_data,
            suggestions=[
                "What is my portfolio Sharpe ratio?",
                "Show my risk metrics",
                "How diversified is my portfolio?",
            ],
        )

    # Both LLM and yfinance failed — surface the real error context
    logger.error(
        "_agent_fallback: yfinance also failed — no data available. "
        "Original error context: %s", error_context
    )
    return AgentResponse(
        message=(
            "I'm unable to analyse your portfolio right now: the AI service is "
            "unavailable and live market data could not be fetched. "
            "Please check your API keys and network connectivity, then try again."
        ),
        chart_type="none",
        chart_data=None,
        suggestions=[],
    )


async def run_agent_async(
    user_message: str,
    portfolio: list[dict],
    chat_history: list[dict] | None = None,
    exchange: str = "NSE",
    period: str = "1y",
) -> AgentResponse:
    """
    Async wrapper around run_agent for use in FastAPI async route handlers.
    Runs the blocking graph in the default ThreadPoolExecutor.
    """
    import asyncio
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None,
        lambda: run_agent(user_message, portfolio, chat_history, exchange, period),
    )
