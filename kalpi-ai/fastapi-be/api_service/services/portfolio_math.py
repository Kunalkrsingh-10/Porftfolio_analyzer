"""
portfolio_math.py

Time-series–based portfolio math using yfinance for NSE/BSE data.
All functions are stateless and operate on pd.Series / pd.DataFrame.

yfinance session policy
-----------------------
yfinance ≥ 0.2.x authenticates against Yahoo Finance via a cookie/crumb
exchange that it manages internally.  Injecting a custom requests.Session
(even one with verify=False) bypasses that cookie machinery and raises
YFDataException / YFTzMissingError on every call.

The fix is simple: call yf.Ticker(symbol) with NO session argument and let
yfinance manage its own HTTP session.  This is what the library expects.

If you hit SSL errors inside Docker, set the environment variable
  PYTHONHTTPSVERIFY=0
or copy a valid CA bundle into the container instead of bypassing TLS in code.

Double-suffix guard
-------------------
_build_yf_symbol() checks for BOTH '.NS' and '.BO' before appending a suffix,
so a ticker that already carries one (e.g. "NTPC.NS" passed from CSV parsing)
is never mangled into "NTPC.NS.NS".
"""

from __future__ import annotations

import logging
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from enum import Enum

import numpy as np
import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

TRADING_DAYS_PER_YEAR: int = 252

# India 10-year G-sec yield (~6.5%) as proxy for the risk-free rate.
DEFAULT_RISK_FREE_RATE: float = 0.065

# All exchange suffixes recognised by _build_yf_symbol.
_EXCHANGE_SUFFIXES: frozenset[str] = frozenset({".NS", ".BO"})

# ── Ticker alias / rewrite table ──────────────────────────────────────────────
#
# Maps a stale / merged / delisted bare ticker to the current Yahoo Finance
# bare symbol.  Applied BEFORE the exchange suffix is appended.
#
# Why a table here instead of in the agent layer?
#   _build_yf_symbol() is the single choke-point for all yfinance calls;
#   keeping aliases here guarantees the rewrite is applied consistently
#   whether the call comes from a LangGraph tool, the single-stock fast-path,
#   or the direct portfolio fallback.
#
_TICKER_ALIASES: dict[str, str] = {
    # HDFC Ltd merged into HDFC Bank in July 2023.
    # Yahoo Finance delisted HDFC.NS; the correct live symbol is HDFCBANK.NS.
    "HDFC": "HDFCBANK",
    # Add further entries as stocks are renamed, merged, or delisted:
    # "OLD_SYMBOL": "NEW_SYMBOL",
}


# ── Exchange Enum ─────────────────────────────────────────────────────────────

class Exchange(str, Enum):
    NSE = "NS"
    BSE = "BO"


# ── Internal helpers ──────────────────────────────────────────────────────────

def _sanitize_ticker(raw: str) -> str:
    """
    Return a clean bare ticker symbol, ready for exchange-suffix appending.

    Processing pipeline (applied in order):
      1. Strip surrounding whitespace and convert to uppercase.
      2. Remove Refinitiv / Bloomberg exchange qualifiers that sometimes appear
         in imported CSV data — e.g. ``HDFC:NSE`` → ``HDFC``,
         ``500325:BSE`` → ``500325``, ``INFY:NSI`` → ``INFY``.
      3. Remove any existing Yahoo Finance exchange suffix so alias lookup
         works on a clean base — e.g. ``HDFCBANK.NS`` → ``HDFCBANK``.
         This also prevents the double-suffix bug ``HDFCBANK.NS.NS``.
      4. Apply ``_TICKER_ALIASES`` rewrites — e.g. ``HDFC`` → ``HDFCBANK``.

    Returns the canonical bare symbol (no exchange suffix).
    """
    t = raw.strip().upper()
    # Strip Refinitiv/Bloomberg qualifiers:  HDFC:NSE  →  HDFC
    t = re.sub(r':.*$', '', t)
    # Remove existing YF suffix so alias lookup is clean:  HDFC.NS  →  HDFC
    t = re.sub(r'\.(NS|BO)$', '', t, flags=re.IGNORECASE)
    # Apply alias rewrite table
    return _TICKER_ALIASES.get(t, t)


def sanitize_ticker(raw: str) -> str:
    """
    Public wrapper — return the canonical bare ticker for *raw*.

    Strips Refinitiv/Bloomberg exchange qualifiers (:NSE, :BSE, …),
    removes Yahoo Finance suffixes (.NS, .BO), and applies the
    ``_TICKER_ALIASES`` rewrite table (e.g. "HDFC" → "HDFCBANK").

    Use this before storing or displaying a ticker that came from user
    input or an external CSV so the label always matches what yfinance
    actually fetches.
    """
    return _sanitize_ticker(raw)


def _build_yf_symbol(ticker: str, exchange: Exchange) -> str:
    """
    Return the Yahoo Finance symbol for *ticker* on *exchange*.

    Sanitizes the raw ticker first — strips ``:NSE``/``:BSE`` qualifiers,
    removes any existing ``.NS``/``.BO`` suffix, and applies alias rewrites
    (e.g. ``HDFC`` → ``HDFCBANK``) — then appends the correct exchange
    suffix.  The double-suffix guard means ``NTPC.NS`` is never mangled
    into ``NTPC.NS.NS``.

    Examples
    --------
    >>> _build_yf_symbol("RELIANCE", Exchange.NSE)     # → "RELIANCE.NS"
    >>> _build_yf_symbol("HDFC",     Exchange.NSE)     # → "HDFCBANK.NS"
    >>> _build_yf_symbol("NTPC.NS",  Exchange.NSE)     # → "NTPC.NS"
    >>> _build_yf_symbol("INFY:NSE", Exchange.NSE)     # → "INFY.NS"
    >>> _build_yf_symbol("HDFCBANK.NS.NS", Exchange.NSE) # → "HDFCBANK.NS"
    """
    bare = _sanitize_ticker(ticker)
    # Defensive check: _sanitize_ticker already strips suffixes, but guard
    # against callers that pass a pre-suffixed string with an unusual format.
    if any(bare.endswith(sfx) for sfx in _EXCHANGE_SUFFIXES):
        return bare
    return f"{bare}.{exchange.value}"


def _close_series(df: pd.DataFrame) -> pd.Series:
    """
    Extract the 'Close' column from a yfinance DataFrame as a flat Series.

    Handles both flat columns (single-ticker .history()) and MultiIndex
    columns (legacy yf.download() paths).
    """
    if isinstance(df.columns, pd.MultiIndex):
        return df["Close"].squeeze()
    return df["Close"]


# ── Data Fetching ─────────────────────────────────────────────────────────────

def fetch_historical_prices(
    ticker: str,
    exchange: Exchange = Exchange.NSE,
    period: str = "1y",
    interval: str = "1d",
) -> pd.DataFrame:
    """
    Fetch OHLCV history for a single NSE or BSE ticker via yfinance.

    yfinance manages its own HTTP session (cookie/crumb auth).  No custom
    session is passed — doing so would raise YFDataException in yfinance ≥ 0.2.

    Args:
        ticker:   Raw ticker symbol, with or without exchange suffix
                  (e.g. "ZOMATO", "RELIANCE", "NTPC.NS", "500325").
        exchange: Exchange.NSE (appends .NS) or Exchange.BSE (appends .BO).
                  Ignored if the ticker already carries a suffix.
        period:   yfinance period string — "1d","5d","1mo","3mo","6mo","1y",
                  "2y","5y","10y","ytd","max".
        interval: Bar interval — "1d","1wk","1mo" etc.

    Returns:
        DataFrame with DatetimeIndex and columns Open/High/Low/Close/Volume.
        Prices are already adjusted (auto_adjust=True).

    Raises:
        ValueError: Ticker not found, network error, or no history for period.
                    The original exception is chained so the full traceback
                    appears in `docker logs` when called with logger.exception().
    """
    symbol = _build_yf_symbol(ticker, exchange)
    logger.info(
        "Fetching yfinance history for '%s' (period=%s, interval=%s)",
        symbol, period, interval,
    )

    try:
        # No session= argument — yfinance handles cookie/crumb auth internally.
        df: pd.DataFrame = yf.Ticker(symbol).history(
            period=period,
            interval=interval,
            auto_adjust=True,
        )
    except Exception as exc:
        logger.exception(
            "yfinance raised an exception fetching '%s' (period=%s): %s",
            symbol, period, exc,
        )
        raise ValueError(
            f"yfinance exception for '{symbol}': {type(exc).__name__}: {exc}"
        ) from exc

    if df is None or df.empty:
        logger.error(
            "yfinance returned empty DataFrame for '%s' (period=%s). "
            "Possible causes: invalid ticker, delisted, or Yahoo Finance "
            "rate-limiting. Check docker logs for errors above.",
            symbol, period,
        )
        raise ValueError(
            f"No price data returned by yfinance for ticker '{symbol}' "
            f"(period={period}). Verify the ticker is valid on Yahoo Finance "
            f"(e.g. https://finance.yahoo.com/quote/{symbol})."
        )

    logger.info(
        "Fetched %d bars for '%s' (%s → %s)",
        len(df), symbol,
        df.index[0].strftime("%Y-%m-%d"),
        df.index[-1].strftime("%Y-%m-%d"),
    )
    return df


def fetch_multiple_tickers(
    tickers: list[str],
    exchange: Exchange = Exchange.NSE,
    period: str = "1y",
    interval: str = "1d",
) -> dict[str, pd.DataFrame]:
    """
    Fetch historical OHLCV data for multiple tickers in parallel.

    Each ticker is fetched via an individual yf.Ticker().history() call
    (not yf.download()) for two reasons:
      1. yf.download() with a single ticker returns a differently shaped
         DataFrame (flat vs MultiIndex) depending on the yfinance version.
      2. Per-ticker isolation: one failing ticker never blocks the rest.

    Uses ThreadPoolExecutor(max_workers=8) so a 15-ticker portfolio
    still completes in ~2–3 s even with retries.

    Args:
        tickers:  List of raw ticker symbols (no exchange suffix required).
        exchange: Exchange to append suffix for (unless already present).
        period:   yfinance period string.
        interval: Bar interval.

    Returns:
        Dict mapping original ticker (uppercased) → OHLCV DataFrame.
        Tickers that fail are omitted; the full exception is logged so it
        appears in `docker logs <container>`.
    """
    if not tickers:
        return {}

    result: dict[str, pd.DataFrame] = {}

    def _fetch_one(raw_ticker: str) -> tuple[str, pd.DataFrame | None]:
        t_up = raw_ticker.strip().upper()
        try:
            df = fetch_historical_prices(t_up, exchange, period, interval)
            return t_up, df
        except Exception as exc:
            logger.exception(
                "fetch_multiple_tickers: FAILED for '%s.%s' — "
                "ticker will be excluded from chart. Root cause: %s",
                t_up, exchange.value, exc,
            )
            return t_up, None

    with ThreadPoolExecutor(max_workers=min(len(tickers), 8)) as executor:
        futures = {executor.submit(_fetch_one, t): t for t in tickers}
        for future in as_completed(futures):
            try:
                t_up, df = future.result()
            except Exception as exc:
                logger.exception(
                    "Unexpected error in ThreadPoolExecutor worker: %s", exc
                )
                continue

            if df is not None and not df.empty:
                result[t_up] = df
            else:
                logger.warning(
                    "No data returned for '%s' — ticker excluded from analysis.",
                    futures[future].strip().upper(),
                )

    if not result:
        logger.error(
            "fetch_multiple_tickers: ALL tickers failed. "
            "Tickers attempted: %s. "
            "Check docker logs above for yfinance / network errors.",
            [t.strip().upper() for t in tickers],
        )

    return result


# ── Return Metrics ────────────────────────────────────────────────────────────

def calculate_daily_returns(prices: pd.Series) -> pd.Series:
    """
    Compute simple daily returns from a price series.

    Returns:
        Series of daily returns with the first NaN dropped.
    """
    if len(prices) < 2:
        raise ValueError("Need at least 2 price points to compute daily returns.")
    return prices.pct_change().dropna()


def calculate_total_return(prices: pd.Series) -> float:
    """
    Simple total return from first to last price.

    Returns:
        Decimal fraction (e.g. 0.35 = +35%).
    """
    if len(prices) < 2:
        raise ValueError("Need at least 2 price points to calculate total return.")
    start = float(prices.iloc[0])
    end   = float(prices.iloc[-1])
    if start <= 0:
        raise ValueError("Starting price must be positive.")
    return (end - start) / start


def calculate_cagr(
    prices: pd.Series,
    periods_per_year: int = TRADING_DAYS_PER_YEAR,
) -> float:
    """
    Compound Annual Growth Rate using the number of price bars.

    CAGR = (P_end / P_start) ^ (periods_per_year / n_periods) − 1

    Returns:
        Decimal fraction (e.g. 0.15 = 15% annual growth).
    """
    if len(prices) < 2:
        raise ValueError("Need at least 2 price points to calculate CAGR.")
    start = float(prices.iloc[0])
    end   = float(prices.iloc[-1])
    if start <= 0:
        raise ValueError("Starting price must be positive.")
    n_periods = len(prices) - 1
    years = n_periods / periods_per_year
    if years <= 0:
        raise ValueError("Holding period must be greater than zero.")
    return float((end / start) ** (1.0 / years) - 1.0)


def calculate_annualized_volatility(
    prices: pd.Series,
    periods_per_year: int = TRADING_DAYS_PER_YEAR,
) -> float:
    """
    Annualized volatility = std(daily_returns) × √(periods_per_year).

    Returns:
        Decimal fraction (e.g. 0.22 = 22% annualized volatility).
    """
    returns = calculate_daily_returns(prices)
    if len(returns) < 2:
        raise ValueError("Need at least 3 price points to calculate volatility.")
    return float(returns.std(ddof=1) * np.sqrt(periods_per_year))


# ── Risk Metrics ──────────────────────────────────────────────────────────────

def calculate_var_95(
    prices: pd.Series,
    portfolio_value: float = 1.0,
    periods_per_year: int = TRADING_DAYS_PER_YEAR,
) -> float:
    """
    Historical (non-parametric) 1-day Value at Risk at 95% confidence.

    Uses the empirical 5th percentile of the daily return distribution.

    Returns:
        Negative monetary loss (e.g. -12500.0 means max 1-day loss ≤ ₹12,500
        at 95% confidence).  Returns a fraction when portfolio_value=1.0.

    Raises:
        ValueError: Fewer than 21 price points (insufficient for VaR).
    """
    returns = calculate_daily_returns(prices)
    if len(returns) < 20:
        raise ValueError(
            f"VaR requires at least 21 price points; got {len(prices)}. "
            "Use period='3mo' or longer."
        )
    if portfolio_value <= 0:
        raise ValueError("portfolio_value must be positive.")
    var_pct = float(np.percentile(returns.values, 5))
    return var_pct * portfolio_value


def calculate_max_drawdown(prices: pd.Series) -> float:
    """
    Maximum Drawdown: largest peak-to-trough percentage decline.

    Returns:
        Negative decimal (e.g. -0.30 = 30% peak-to-trough loss).
    """
    if len(prices) < 2:
        raise ValueError("Need at least 2 price points to calculate max drawdown.")
    rolling_peak = prices.cummax()
    drawdown = (prices - rolling_peak) / rolling_peak
    return float(drawdown.min())


def calculate_sharpe_ratio(
    prices: pd.Series,
    risk_free_rate: float = DEFAULT_RISK_FREE_RATE,
    periods_per_year: int = TRADING_DAYS_PER_YEAR,
) -> float:
    """
    Annualized Sharpe Ratio.

    Sharpe = (mean_daily_excess_return / std_daily_return) × √(periods_per_year)

    Returns:
        Sharpe Ratio (dimensionless).

    Raises:
        ValueError: Zero volatility (constant price — undefined ratio).
    """
    returns = calculate_daily_returns(prices)
    if len(returns) < 2:
        raise ValueError("Need at least 3 price points to calculate Sharpe Ratio.")
    daily_rf       = risk_free_rate / periods_per_year
    excess_returns = returns - daily_rf
    std            = float(returns.std(ddof=1))
    if std == 0.0:
        raise ValueError(
            "Standard deviation of returns is zero — Sharpe Ratio is undefined "
            "for a constant price series."
        )
    return float(excess_returns.mean() / std * np.sqrt(periods_per_year))


# ── Convenience: compute everything at once ───────────────────────────────────

def compute_all_metrics(
    prices: pd.Series,
    portfolio_value: float = 1.0,
    risk_free_rate: float = DEFAULT_RISK_FREE_RATE,
    periods_per_year: int = TRADING_DAYS_PER_YEAR,
) -> dict[str, float]:
    """
    Compute all six metrics for a single price series.

    Returns:
        Dict with keys:
            total_return          – decimal fraction
            cagr                  – decimal fraction (annualized)
            annualized_volatility – decimal fraction
            var_95                – negative monetary loss (or fraction)
            max_drawdown          – negative decimal fraction
            sharpe_ratio          – dimensionless float
    """
    return {
        "total_return":          calculate_total_return(prices),
        "cagr":                  calculate_cagr(prices, periods_per_year),
        "annualized_volatility": calculate_annualized_volatility(prices, periods_per_year),
        "var_95":                calculate_var_95(prices, portfolio_value, periods_per_year),
        "max_drawdown":          calculate_max_drawdown(prices),
        "sharpe_ratio":          calculate_sharpe_ratio(prices, risk_free_rate, periods_per_year),
    }


def compute_metrics_from_ticker(
    ticker: str,
    exchange: Exchange = Exchange.NSE,
    period: str = "1y",
    interval: str = "1d",
    portfolio_value: float = 1.0,
    risk_free_rate: float = DEFAULT_RISK_FREE_RATE,
) -> dict[str, float]:
    """
    Fetch historical data and compute all six metrics in one call.

    Args:
        ticker:          Raw NSE/BSE ticker (e.g. "ZOMATO", "RELIANCE", "NTPC.NS").
        exchange:        Exchange.NSE or Exchange.BSE.
        period:          yfinance period string (e.g. "1y", "3y").
        interval:        Bar interval (e.g. "1d", "1wk").
        portfolio_value: INR value for VaR scaling.
        risk_free_rate:  Annual risk-free rate decimal.

    Returns:
        Dict of all six metrics (same schema as compute_all_metrics).

    Raises:
        ValueError: If yfinance cannot fetch data (full details in docker logs).
    """
    df     = fetch_historical_prices(ticker, exchange, period, interval)
    prices = _close_series(df).dropna()
    return compute_all_metrics(
        prices,
        portfolio_value=portfolio_value,
        risk_free_rate=risk_free_rate,
    )
