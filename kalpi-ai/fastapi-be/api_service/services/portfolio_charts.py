"""
portfolio_charts.py

Compute chart-ready time-series and allocation data for the dashboard.
All heavy lifting (yfinance) is delegated to portfolio_math; results are
returned as plain dicts suitable for JSON serialisation.

Single-ticker behaviour
-----------------------
When the portfolio contains exactly one ticker, chart_data["cumulative_returns"]
is populated with that ticker's REAL indexed price series.  The same series is
placed in both `portfolio` (the weighted-portfolio line) and
`per_ticker[TICKER]` (the individual line) so the Plotly CumulativeReturnChart
renders the live curve — not the static mock fallback.

Additionally, per-ticker Total Return (%) and CAGR (%) are returned under
chart_data["ticker_stats"] so the frontend KPI cards can display live numbers.

Error policy
------------
• All exceptions are logged with logger.exception() so the FULL Python
  traceback appears in `docker logs <api-service-container>`.
• When yfinance fails for a ticker, that ticker is OMITTED from the result
  and listed in chart_data["errors"]; no static/mock array is ever substituted.
• When ALL tickers fail, the function returns an explicit error structure with
  empty date arrays — the frontend must treat that as a fetch error, not as
  an excuse to render mock data.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
import pandas as pd

from services.portfolio_math import (
    Exchange,
    calculate_cagr,
    calculate_total_return,
    fetch_multiple_tickers,
    TRADING_DAYS_PER_YEAR,
)

logger = logging.getLogger(__name__)

# ── Sector lookup (Nifty 50 / large-cap NSE) ─────────────────────────────────
# Covers ~90 % of common retail portfolios; yfinance info() fallback for rest.

_NSE_SECTORS: dict[str, str] = {
    "RELIANCE": "Energy",
    "TCS": "Technology",
    "HDFCBANK": "Banking & Finance",
    "INFY": "Technology",
    "ICICIBANK": "Banking & Finance",
    "HINDUNILVR": "FMCG",
    "ITC": "FMCG",
    "SBIN": "Banking & Finance",
    "BHARTIARTL": "Telecom",
    "KOTAKBANK": "Banking & Finance",
    "LT": "Infrastructure",
    "AXISBANK": "Banking & Finance",
    "ASIANPAINT": "Materials",
    "MARUTI": "Automobiles",
    "BAJFINANCE": "Banking & Finance",
    "HCLTECH": "Technology",
    "WIPRO": "Technology",
    "ULTRACEMCO": "Materials",
    "NESTLEIND": "FMCG",
    "TITAN": "Consumer Discretionary",
    "POWERGRID": "Utilities",
    "NTPC": "Utilities",
    "ONGC": "Energy",
    "COALINDIA": "Energy",
    "SUNPHARMA": "Healthcare",
    "DRREDDY": "Healthcare",
    "CIPLA": "Healthcare",
    "DIVISLAB": "Healthcare",
    "APOLLOHOSP": "Healthcare",
    "BAJAJFINSV": "Banking & Finance",
    "ADANIENT": "Infrastructure",
    "ADANIPORTS": "Infrastructure",
    "TATASTEEL": "Materials",
    "JSWSTEEL": "Materials",
    "HINDALCO": "Materials",
    "M&M": "Automobiles",
    "EICHERMOT": "Automobiles",
    "HEROMOTOCO": "Automobiles",
    "TATAMOTORS": "Automobiles",
    "GRASIM": "Materials",
    "TECHM": "Technology",
    "BPCL": "Energy",
    "IOC": "Energy",
    "INDUSINDBK": "Banking & Finance",
    "BRITANNIA": "FMCG",
    "TATACONSUM": "FMCG",
    "VEDL": "Materials",
    "SHREECEM": "Materials",
    "PIDILITIND": "Materials",
    "SIEMENS": "Industrials",
    "ABB": "Industrials",
    "HAL": "Defence",
    "BEL": "Defence",
    "IRCTC": "Consumer Services",
    "DMART": "Retail",
    "ZOMATO": "Consumer Services",
    "PAYTM": "Technology",
    "NYKAA": "Consumer Services",
    "POLICYBZR": "Banking & Finance",
}


# ── Internal helpers ───────────────────────────────────────────────────────────

def _sector_for_ticker(ticker: str, exchange: Exchange) -> str:
    """Return sector for a ticker. Falls back to yfinance info() then 'Other'."""
    t = ticker.upper().replace(f".{exchange.value}", "")
    if t in _NSE_SECTORS:
        return _NSE_SECTORS[t]
    try:
        import yfinance as yf
        from services.portfolio_math import _build_yf_symbol
        sym  = _build_yf_symbol(t, exchange)
        info = yf.Ticker(sym).info      # no session= — yfinance manages auth internally
        return info.get("sector") or info.get("industry") or "Other"
    except Exception:
        logger.exception("Could not fetch sector for '%s' via yfinance", ticker)
        return "Other"


def _build_price_matrix(
    tickers: list[str],
    exchange: Exchange,
    period: str,
) -> tuple[pd.DataFrame, list[str]]:
    """
    Fetch closing prices for all tickers and return an aligned DataFrame.

    Uses fetch_multiple_tickers() which:
      • Makes one yf.Ticker().history() call per ticker (not yf.download)
      • Runs in parallel via ThreadPoolExecutor
      • Logs FULL exceptions via logger.exception() — visible in docker logs

    Returns:
        (price_df, available_tickers)
        price_df has DatetimeIndex and one column per *successful* ticker.
        Tickers that yfinance could not fetch are absent; their error details
        are already in docker logs from the inner fetch_multiple_tickers call.
    """
    raw = fetch_multiple_tickers(tickers, exchange=exchange, period=period)

    frames: dict[str, pd.Series] = {}
    for t in tickers:
        t_up = t.upper()
        if t_up not in raw or raw[t_up].empty:
            logger.error(
                "_build_price_matrix: no price data for '%s' — "
                "excluded from chart. See docker logs for yfinance exception.",
                t_up,
            )
            continue
        df_t = raw[t_up]
        # Extract Close — always flat (single-ticker .history() has no MultiIndex)
        if "Close" not in df_t.columns:
            logger.error(
                "_build_price_matrix: 'Close' column missing in data for '%s'. "
                "Available columns: %s",
                t_up, list(df_t.columns),
            )
            continue
        close = df_t["Close"].dropna()
        if close.empty:
            logger.error(
                "_build_price_matrix: Close series is all-NaN for '%s'", t_up
            )
            continue
        frames[t_up] = close

    if not frames:
        return pd.DataFrame(), []

    df = pd.DataFrame(frames).dropna(how="all")
    available = list(df.columns)
    return df, available


def _compute_cumulative_returns(
    price_df: pd.DataFrame,
    tickers: list[str],
    weights: dict[str, float],
) -> dict[str, Any]:
    """
    Build indexed cumulative return series (base = 100 on day 0).

    For a single-ticker portfolio:
      portfolio  == per_ticker[ticker] == the ticker's own indexed prices.

    Returns a dict ready for JSON:
        {
          "dates":        ["2024-05-01", ...],
          "portfolio":    [100.0, 101.3, ...],
          "per_ticker":   {"ZOMATO": [100.0, ...], ...}
        }
    """
    if price_df.empty:
        return {"dates": [], "portfolio": [], "per_ticker": {}}

    # Normalise so each series starts at 100
    indexed = (price_df / price_df.iloc[0]) * 100

    # Weighted portfolio series
    present = [t for t in tickers if t in indexed.columns]
    total_w = sum(weights.get(t, 0) for t in present)
    if total_w == 0:
        return {"dates": [], "portfolio": [], "per_ticker": {}}

    portfolio_series = sum(
        indexed[t] * (weights.get(t, 0) / total_w) for t in present
    )

    dates = [d.strftime("%Y-%m-%d") for d in indexed.index]
    return {
        "dates": dates,
        "portfolio": [round(v, 2) for v in portfolio_series.tolist()],
        "per_ticker": {
            t: [round(v, 2) for v in indexed[t].tolist()]
            for t in present
        },
    }


def _compute_rolling_volatility(
    price_df: pd.DataFrame,
    tickers: list[str],
    weights: dict[str, float],
    window: int = 21,
) -> dict[str, Any]:
    """
    Compute annualised rolling volatility (%) for the weighted portfolio.

    Returns:
        {"dates": [...], "portfolio": [...]}
    """
    if price_df.empty or len(price_df) < window + 1:
        return {"dates": [], "portfolio": []}

    present = [t for t in tickers if t in price_df.columns]
    total_w = sum(weights.get(t, 0) for t in present)
    if total_w == 0:
        return {"dates": [], "portfolio": []}

    daily_returns = price_df[present].pct_change().dropna()

    w_arr = np.array([weights.get(t, 0) / total_w for t in present])
    portfolio_returns = daily_returns.values @ w_arr

    rolling_vol = (
        pd.Series(portfolio_returns, index=daily_returns.index)
        .rolling(window)
        .std()
        * np.sqrt(TRADING_DAYS_PER_YEAR)
        * 100  # express as %
    ).dropna()

    return {
        "dates": [d.strftime("%Y-%m-%d") for d in rolling_vol.index],
        "portfolio": [round(v, 2) for v in rolling_vol.tolist()],
    }


def _get_sector_allocation(
    tickers: list[str],
    weights: dict[str, float],
    exchange: Exchange,
) -> dict[str, Any]:
    """
    Aggregate portfolio weight by sector.

    Returns:
        {"labels": ["Technology", ...], "values": [32.1, ...]}
    """
    sector_weights: dict[str, float] = {}
    total_w = sum(weights.get(t, 0) for t in tickers)
    if total_w == 0:
        return {"labels": [], "values": []}

    for t in tickers:
        sector = _sector_for_ticker(t, exchange)
        pct = (weights.get(t, 0) / total_w) * 100
        sector_weights[sector] = sector_weights.get(sector, 0) + pct

    pairs = sorted(sector_weights.items(), key=lambda x: x[1], reverse=True)
    return {
        "labels": [p[0] for p in pairs],
        "values": [round(p[1], 2) for p in pairs],
    }


def _compute_ticker_stats(
    price_df: pd.DataFrame,
    available: list[str],
) -> dict[str, Any]:
    """
    Compute per-ticker Total Return (%) and CAGR (%) from the price matrix.

    These are included in the chart_data response so the frontend KPI cards
    can display real numbers (not dummy data) for single-ticker analysis.

    Returns:
        {
          "ZOMATO": {"total_return_pct": 18.4, "cagr_pct": 17.1, "bars": 252},
          ...
        }
    """
    stats: dict[str, Any] = {}
    for t in available:
        if t not in price_df.columns:
            continue
        prices = price_df[t].dropna()
        if len(prices) < 2:
            continue
        try:
            total_ret = calculate_total_return(prices)
            cagr = calculate_cagr(prices)
            stats[t] = {
                "total_return_pct": round(total_ret * 100, 2),
                "cagr_pct":         round(cagr * 100, 2),
                "bars":             len(prices),
            }
        except Exception as exc:
            logger.exception(
                "_compute_ticker_stats: failed for '%s': %s", t, exc
            )
    return stats


# ── Public entry-point ─────────────────────────────────────────────────────────

def get_chart_data(
    portfolio: list[dict[str, Any]],
    exchange_str: str = "NS",
    period: str = "1y",
    rolling_window: int = 21,
) -> dict[str, Any]:
    """
    Fetch price history and return all chart data in one dict.

    Args:
        portfolio:      List of {"ticker": str, "weight": float} dicts.
                        Weights are fractions (0–1) or percentages — normalised.
        exchange_str:   "NS" for NSE, "BO" for BSE.
        period:         yfinance period string (e.g. "1y", "6mo").
        rolling_window: Days for rolling volatility.

    Returns:
        {
          "cumulative_returns": {
              "dates":      ["2024-05-01", ...],
              "portfolio":  [100.0, ...],
              "per_ticker": {"ZOMATO": [100.0, ...], ...}
          },
          "rolling_volatility": {"dates": [...], "portfolio": [...]},
          "sector_allocation":  {"labels": [...], "values": [...]},
          "ticker_stats": {
              "ZOMATO": {"total_return_pct": 18.4, "cagr_pct": 17.1, "bars": 252}
          },
          "errors": [str, ...]   ← non-empty when tickers could not be fetched;
                                    check docker logs for full tracebacks.
        }

    Error contract:
        When yfinance fails for all tickers, "cumulative_returns.dates" is []
        and "errors" is non-empty.  The frontend MUST treat [] dates as a
        fetch-failure state — never fall back to static mock arrays.
    """
    errors: list[str] = []

    # --- resolve exchange
    try:
        exchange = Exchange(exchange_str)
    except ValueError:
        exchange = Exchange.NSE
        errors.append(f"Unknown exchange '{exchange_str}', defaulting to NSE")

    # --- extract tickers + build weight map
    tickers = [item["ticker"].upper() for item in portfolio if item.get("ticker")]
    raw_weights = {
        item["ticker"].upper(): float(item.get("weight", 0))
        for item in portfolio
        if item.get("ticker")
    }

    if not tickers:
        return {
            "cumulative_returns": {"dates": [], "portfolio": [], "per_ticker": {}},
            "rolling_volatility": {"dates": [], "portfolio": []},
            "sector_allocation":  {"labels": [], "values": []},
            "ticker_stats":       {},
            "errors":             ["No tickers provided"],
        }

    # --- normalise weights
    total_w = sum(raw_weights.values())
    weights = {
        t: (w / total_w) if total_w > 0 else 1 / len(tickers)
        for t, w in raw_weights.items()
    }

    # --- fetch prices (each ticker individually, parallel, SSL-bypass session)
    try:
        price_df, available = _build_price_matrix(tickers, exchange, period)
    except Exception as exc:
        logger.exception(
            "get_chart_data: _build_price_matrix raised an unexpected exception: %s",
            exc,
        )
        return {
            "cumulative_returns": {"dates": [], "portfolio": [], "per_ticker": {}},
            "rolling_volatility": {"dates": [], "portfolio": []},
            "sector_allocation":  _get_sector_allocation(tickers, weights, exchange),
            "ticker_stats":       {},
            "errors":             [
                f"Price fetch raised an exception: {type(exc).__name__}: {exc}. "
                "See docker logs for full traceback."
            ],
        }

    skipped = [t for t in tickers if t not in available]
    if skipped:
        err_msg = (
            f"yfinance returned no data for: {', '.join(skipped)}. "
            "Check docker logs — the full exception (SSL error, rate-limit, "
            "invalid ticker etc.) is logged there."
        )
        errors.append(err_msg)
        logger.error("get_chart_data: skipped tickers: %s", skipped)

    if not available:
        # All tickers failed — return a clear error; never return empty arrays
        # silently so the frontend would show mock data.
        return {
            "cumulative_returns": {"dates": [], "portfolio": [], "per_ticker": {}},
            "rolling_volatility": {"dates": [], "portfolio": []},
            "sector_allocation":  _get_sector_allocation(tickers, weights, exchange),
            "ticker_stats":       {},
            "errors":             errors or [
                "All tickers failed to fetch. Check docker logs for yfinance errors."
            ],
        }

    # --- compute charts
    cum_ret     = _compute_cumulative_returns(price_df, available, weights)
    roll_vol    = _compute_rolling_volatility(price_df, available, weights, rolling_window)
    sector_alloc = _get_sector_allocation(tickers, weights, exchange)
    ticker_stats = _compute_ticker_stats(price_df, available)

    logger.info(
        "get_chart_data: success — %d/%d tickers, %d date points. "
        "Tickers: %s",
        len(available), len(tickers),
        len(cum_ret.get("dates", [])),
        available,
    )

    return {
        "cumulative_returns": cum_ret,
        "rolling_volatility": roll_vol,
        "sector_allocation":  sector_alloc,
        "ticker_stats":       ticker_stats,
        "errors":             errors,
    }
