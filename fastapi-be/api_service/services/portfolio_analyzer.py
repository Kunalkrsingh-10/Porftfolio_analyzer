"""
Portfolio Analysis Service
Deterministic financial calculations using pandas, numpy, and live yfinance data.

On every upload the analyzer:
  1. Fetches the real current price for each ticker via yfinance (.NS suffix).
  2. Fetches the sector/industry label from yfinance Ticker.info when the CSV
     does not supply one.
  3. Fetches full split-adjusted price history per ticker to compute a correct
     adj_purchase_price and adj_return_pct for each holding — this prevents
     stock splits (e.g. NESTLEIND 10:1, Oct 2024) from showing fake -90%+ losses
     when the CSV holds a pre-split purchase price.
  4. Computes all metrics using the adjusted prices so return_pct, pnl,
     portfolio_value, sharpe, drawdown, and VaR are all split-correct.

Falls back to the CSV price column if yfinance returns no data for a ticker,
logging a warning so the operator knows which tickers need attention.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────

RISK_FREE_RATE: float = 0.065        # India 10-yr G-sec (~6.5%)
TRADING_DAYS_PER_YEAR: int = 252
_NSE_SUFFIX = ".NS"
_BSE_SUFFIX = ".BO"


# ── yfinance helpers ───────────────────────────────────────────────────────────

def _yf_symbol(ticker: str, exchange_suffix: str = _NSE_SUFFIX) -> str:
    """Append Yahoo Finance exchange suffix if not already present."""
    t = ticker.strip().upper()
    return t if t.endswith(exchange_suffix) else f"{t}{exchange_suffix}"


def _fetch_live_price(ticker: str, exchange_suffix: str = _NSE_SUFFIX) -> Optional[float]:
    """
    Fetch the most-recent closing price for a ticker via yfinance.history().

    Uses a short 5-day window so the call is fast even for large portfolios.
    Returns None if the ticker is not found or the response is empty.
    """
    symbol = _yf_symbol(ticker, exchange_suffix)
    try:
        hist = yf.Ticker(symbol).history(period="5d", interval="1d", auto_adjust=True)
        if hist.empty:
            logger.warning("yfinance: no price data for '%s'", symbol)
            return None
        close = hist["Close"].dropna()
        if close.empty:
            return None
        return float(close.iloc[-1])
    except Exception as exc:
        logger.warning("yfinance error for '%s': %s", symbol, exc)
        return None


def _fetch_price_history(
    ticker: str,
    start_date: pd.Timestamp,
    exchange_suffix: str = _NSE_SUFFIX,
) -> Optional[pd.Series]:
    """
    Fetch the full split-adjusted close price series for *ticker* from
    *start_date* to today (auto_adjust=True so every historical bar is
    back-filled to the current share structure after splits/bonuses).

    Returns a timezone-naive pd.Series indexed by date, or None on failure.

    Why this matters
    ----------------
    yfinance's auto_adjust=True always returns prices in today's share
    structure.  E.g. after NESTLEIND's 10:1 split (Oct 2024) the pre-split
    bars are shown at 1/10th of the original price.  This function gives us
    the adjusted price *at the purchase date*, which we compare against the
    adjusted current price to get a split-correct % return.
    """
    symbol = _yf_symbol(ticker, exchange_suffix)
    try:
        # Go 7 days before start_date to capture the nearest trading day
        start_str = (start_date - pd.Timedelta(days=7)).strftime("%Y-%m-%d")
        hist = yf.Ticker(symbol).history(start=start_str, auto_adjust=True)
        if hist.empty:
            return None
        close = hist["Close"].dropna()
        if close.empty:
            return None
        # Normalise to timezone-naive date index for safe comparison
        if close.index.tz is not None:
            close.index = close.index.tz_localize(None)
        return close
    except Exception as exc:
        logger.warning("_fetch_price_history error for '%s': %s", symbol, exc)
        return None


def _lookup_adjusted_price(
    price_series: pd.Series,
    target_date: pd.Timestamp,
) -> Optional[float]:
    """
    Return the split-adjusted close on or just before *target_date* from a
    pre-fetched *price_series*.  Returns None when no bar is found within the
    series (e.g. purchase date pre-dates available history).
    """
    try:
        target = (
            target_date.tz_localize(None)
            if target_date.tzinfo is not None
            else target_date
        )
        eligible = price_series[price_series.index <= target + pd.Timedelta(days=1)]
        return float(eligible.iloc[-1]) if not eligible.empty else None
    except Exception as exc:
        logger.debug("_lookup_adjusted_price error: %s", exc)
        return None


def _fetch_sector(ticker: str, exchange_suffix: str = _NSE_SUFFIX) -> Optional[str]:
    """
    Fetch sector from yfinance Ticker.info.
    Returns None on failure (caller substitutes 'Other').
    """
    symbol = _yf_symbol(ticker, exchange_suffix)
    try:
        info = yf.Ticker(symbol).info
        return info.get("sector") or info.get("industry") or None
    except Exception as exc:
        logger.debug("Could not fetch sector for '%s': %s", symbol, exc)
        return None


def _enrich_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    For every row in the normalised DataFrame:
      - Replace current_price with the live yfinance price (if available).
      - Fill missing sector from yfinance Ticker.info (if available).
      - Compute adj_purchase_price: the split-adjusted price on the purchase
        date from yfinance history.  Both current_price and adj_purchase_price
        are on the same post-split basis, so their ratio gives a correct
        return even when a stock split happened between purchase and today.
      - Compute adj_return_pct = (current / adj_purchase - 1) × 100.

    One yf.Ticker / history call per ticker; tolerates partial failures.
    """
    df = df.copy()
    unique_tickers = df["ticker"].unique().tolist()
    live_prices: dict[str, float] = {}
    live_sectors: dict[str, str] = {}
    price_histories: dict[str, pd.Series] = {}   # adj price history per ticker

    for ticker in unique_tickers:
        # ── 1. Live (current) price ───────────────────────────────────────────
        price = _fetch_live_price(ticker)
        if price is not None:
            live_prices[ticker] = price
        else:
            logger.warning(
                "No live price for '%s' — falling back to CSV price column.", ticker
            )

        # ── 2. Full split-adjusted history (one call per ticker) ──────────────
        ticker_rows = df[df["ticker"] == ticker]
        try:
            earliest = pd.to_datetime(ticker_rows["purchase_date"]).min()
            hist = _fetch_price_history(ticker, earliest)
            if hist is not None and not hist.empty:
                price_histories[ticker] = hist
                logger.debug(
                    "Price history for '%s': %d bars from %s",
                    ticker, len(hist), hist.index[0].date(),
                )
        except Exception as exc:
            logger.warning(
                "Could not fetch price history for '%s': %s", ticker, exc
            )

        # ── 3. Sector (only when CSV didn't supply one) ───────────────────────
        if df.loc[df["ticker"] == ticker, "sector"].iloc[0] in ("Other", "", "other"):
            sector = _fetch_sector(ticker)
            if sector:
                live_sectors[ticker] = sector

    # ── Vectorised updates ────────────────────────────────────────────────────
    df["current_price"] = df.apply(
        lambda row: live_prices.get(row["ticker"], row["current_price"]),
        axis=1,
    )
    df["sector"] = df.apply(
        lambda row: live_sectors.get(row["ticker"], row["sector"]),
        axis=1,
    )

    # adj_purchase_price: split-adjusted price on the purchase date.
    # Falls back to the raw CSV price when history is unavailable so existing
    # behaviour is preserved for tickers where yfinance has no data.
    def _adj_purchase(row: pd.Series) -> float:
        hist = price_histories.get(row["ticker"])
        if hist is None or hist.empty:
            return float(row["price"])   # fallback: raw CSV price
        purchase_date = pd.Timestamp(row["purchase_date"])
        adj = _lookup_adjusted_price(hist, purchase_date)
        if adj is None or adj <= 0:
            return float(row["price"])   # fallback: raw CSV price
        return float(adj)

    df["adj_purchase_price"] = df.apply(_adj_purchase, axis=1)

    # adj_return_pct = (current_price / adj_purchase_price − 1) × 100
    # This is split-correct: both prices come from the same auto_adjust=True
    # yfinance series (same share-structure basis).
    df["adj_return_pct"] = df.apply(
        lambda row: round(
            (row["current_price"] / row["adj_purchase_price"] - 1) * 100, 2
        ) if row["adj_purchase_price"] > 0 else 0.0,
        axis=1,
    )

    fetched_prices   = len(live_prices)
    fetched_hist     = len(price_histories)
    total            = len(unique_tickers)
    logger.info(
        "Enrichment complete — live prices: %d/%d, price histories: %d/%d, "
        "sector fallbacks: %d.",
        fetched_prices, total, fetched_hist, total, total - fetched_prices,
    )
    return df


# ── PortfolioAnalyzer ──────────────────────────────────────────────────────────

class PortfolioAnalyzer:
    """
    Deterministic portfolio analysis engine backed by live yfinance data.
    All methods are pure / stateless after _enrich_dataframe() has run.
    """

    # ── Validation & Normalisation ─────────────────────────────────────────────

    @staticmethod
    def validate_portfolio_data(df: pd.DataFrame) -> Tuple[bool, Optional[str]]:
        """Validate that the DataFrame has the minimum required columns."""
        required = {"ticker", "quantity", "price"}
        present = set(df.columns.str.lower().str.strip())
        missing = required - present
        if missing:
            return (
                False,
                f"Missing required columns: {missing}. "
                "Ensure your CSV has 'Ticker', 'Quantity', and 'Price' columns.",
            )
        if df.empty:
            return False, "Portfolio CSV is empty."
        return True, None

    @staticmethod
    def normalize_dataframe(df: pd.DataFrame) -> pd.DataFrame:
        """
        Standardise column names, types, and fill optional columns.
        Does NOT call yfinance — that is done in _enrich_dataframe().
        """
        df = df.copy()
        df.columns = df.columns.str.lower().str.strip()

        # Numeric coercion
        df["quantity"] = pd.to_numeric(df["quantity"], errors="coerce")
        df["price"] = pd.to_numeric(df["price"], errors="coerce")

        # current_price: use CSV column if present, else purchase price
        if "current_price" in df.columns:
            df["current_price"] = pd.to_numeric(df["current_price"], errors="coerce")
            df["current_price"] = df["current_price"].fillna(df["price"])
        else:
            df["current_price"] = df["price"]

        # Sector
        if "sector" not in df.columns:
            df["sector"] = "Other"
        else:
            df["sector"] = df["sector"].fillna("Other").astype(str).str.strip()
            df["sector"] = df["sector"].replace({"": "Other", "nan": "Other"})

        # Ticker normalisation
        df["ticker"] = df["ticker"].astype(str).str.upper().str.strip()

        # Purchase date
        if "purchase_date" in df.columns:
            try:
                df["purchase_date"] = pd.to_datetime(df["purchase_date"], errors="coerce")
            except Exception:
                pass
            df["purchase_date"] = df["purchase_date"].fillna(pd.Timestamp.now())
        else:
            df["purchase_date"] = pd.Timestamp.now()

        # Drop invalid rows
        df = df.dropna(subset=["ticker", "quantity", "price"])
        df = df[(df["quantity"] > 0) & (df["price"] > 0)]

        return df.reset_index(drop=True)

    # ── Metric calculators (all operate on the enriched DataFrame) ─────────────

    @staticmethod
    def calculate_total_return(df: pd.DataFrame) -> float:
        """
        Split-correct portfolio total return.

        Uses adj_return_pct (set by _enrich_dataframe) so a holding whose
        stock split after purchase is not shown as a fake -90%+ loss.
        Each holding is weighted by its share of total cost basis.
        """
        df = df.copy()
        df["purchase_cost"] = df["quantity"] * df["price"]
        total_cost = df["purchase_cost"].sum()
        if total_cost <= 0:
            return 0.0
        # Weighted average of adj_return_pct by cost basis
        port_return = (df["adj_return_pct"] * df["purchase_cost"]).sum() / total_cost
        return round(port_return, 2)

    @staticmethod
    def calculate_annualized_return(df: pd.DataFrame) -> float:
        """Split-correct annualised return, weighted by cost basis."""
        df = df.copy()
        df["purchase_cost"] = df["quantity"] * df["price"]
        total_cost = df["purchase_cost"].sum()
        if total_cost <= 0:
            return 0.0
        total_return_pct = (
            (df["adj_return_pct"] * df["purchase_cost"]).sum() / total_cost
        )
        total_return_dec = total_return_pct / 100
        now = pd.Timestamp.now().tz_localize(None)
        dates = pd.to_datetime(df["purchase_date"]).dt.tz_localize(None)
        avg_days = float((now - dates).dt.days.mean())
        if avg_days <= 0:
            return round(total_return_dec * 100, 2)
        years = avg_days / 365.25
        if years < 0.01:
            return round(total_return_dec * 100, 2)
        return round(((1 + total_return_dec) ** (1 / years) - 1) * 100, 2)

    @staticmethod
    def calculate_portfolio_volatility(df: pd.DataFrame) -> float:
        """
        Cross-sectional volatility proxy (annualised) — used only for the upload
        summary card.  The chat agent uses full time-series volatility via yfinance.
        Uses adj_return_pct so stock splits don't inflate cross-sectional dispersion.
        """
        df = df.copy()
        df["ret"] = df["adj_return_pct"] / 100          # split-adjusted decimal return
        df["purchase_cost"] = df["quantity"] * df["price"]
        total_cost = df["purchase_cost"].sum()
        if total_cost <= 0 or len(df) < 2:
            return 0.0
        df["w"] = df["purchase_cost"] / total_cost       # cost-basis weights
        w_ret = (df["ret"] * df["w"]).sum()
        variance = (df["w"] * (df["ret"] - w_ret) ** 2).sum()
        return round(float(np.sqrt(variance) * np.sqrt(TRADING_DAYS_PER_YEAR) * 100), 2)

    @staticmethod
    def calculate_sharpe_ratio(df: pd.DataFrame) -> float:
        """Split-correct Sharpe — uses adj_return_pct and cost-basis weights."""
        df = df.copy()
        df["purchase_cost"] = df["quantity"] * df["price"]
        total_cost = df["purchase_cost"].sum()
        if total_cost <= 0:
            return 0.0
        df["w"] = df["purchase_cost"] / total_cost
        port_ret = (df["adj_return_pct"] * df["w"]).sum()
        variance = (df["w"] ** 2 * df["adj_return_pct"] ** 2).sum()
        std = float(np.sqrt(variance)) if variance > 0 else 0.0001
        return round((port_ret - RISK_FREE_RATE * 100) / std, 2)

    @staticmethod
    def calculate_max_drawdown(df: pd.DataFrame) -> float:
        """
        Worst individual-holding return in the portfolio (split-adjusted).
        Uses adj_return_pct so a stock split doesn't masquerade as a -90% drawdown.
        """
        df = df.copy()
        mdd = df["adj_return_pct"].min()
        return round(mdd, 2) if mdd < 0 else 0.0

    @staticmethod
    def calculate_var_95(df: pd.DataFrame) -> float:
        """Split-correct cross-sectional VaR — 5th percentile of adj_return_pct."""
        df = df.copy()
        df["purchase_cost"] = df["quantity"] * df["price"]
        total_cost = df["purchase_cost"].sum()
        if total_cost <= 0:
            return 0.0
        df["w"] = df["purchase_cost"] / total_cost
        if len(df) < 2:
            return round(float(df["adj_return_pct"].min() * df["w"].max()), 2)
        port_rets = (df["adj_return_pct"] * df["w"]).values
        return round(float(np.percentile(port_rets, 5)), 2)

    @staticmethod
    def calculate_sector_allocation(df: pd.DataFrame) -> Dict[str, float]:
        df = df.copy()
        df["val"] = df["quantity"] * df["current_price"]
        total = df["val"].sum()
        if total <= 0:
            return {}
        alloc = (df.groupby("sector")["val"].sum() / total * 100).round(1)
        return dict(alloc.sort_values(ascending=False))

    @staticmethod
    def calculate_concentration_risk(df: pd.DataFrame) -> Dict[str, Any]:
        df = df.copy()
        df["val"] = df["quantity"] * df["current_price"]
        total = df["val"].sum()
        if total <= 0:
            return {"hhi": 0.0, "level": "Unknown", "top_positions": []}
        df["w"] = df["val"] / total
        hhi = float((df["w"] ** 2).sum())
        level = (
            "Well Diversified" if hhi < 0.15
            else "Moderately Concentrated" if hhi < 0.25
            else "Highly Concentrated"
        )
        top = (
            df.nlargest(3, "w")[["ticker", "w"]]
            .assign(allocation_pct=lambda x: (x["w"] * 100).round(1))
            .drop(columns="w")
            .to_dict("records")
        )
        return {"hhi": round(hhi, 4), "level": level, "top_positions": top}

    @staticmethod
    def calculate_win_rate(df: pd.DataFrame) -> Dict[str, Any]:
        """Win / loss count using split-adjusted adj_return_pct."""
        df = df.copy()
        total = len(df)
        winners = int((df["adj_return_pct"] > 0).sum())
        losers  = int((df["adj_return_pct"] < 0).sum())
        flat    = total - winners - losers
        return {
            "win_rate": round(winners / total * 100, 1) if total > 0 else 0.0,
            "winners": winners,
            "losers": losers,
            "flat": flat,
            "total": total,
        }

    @staticmethod
    def calculate_risk_score(
        sharpe: float, max_dd: float, var_95: float, volatility: float
    ) -> Dict[str, Any]:
        sharpe_clamped = max(-3.0, min(3.0, sharpe))
        sharpe_score = max(0.0, 30.0 - sharpe_clamped * 10.0)
        dd_score = min(30.0, abs(max_dd))
        var_score = min(20.0, abs(var_95) * 2.0)
        vol_score = min(20.0, volatility / 5.0)
        total = sharpe_score + dd_score + var_score + vol_score
        if total < 25:
            label, color = "Conservative", "#10b981"
        elif total < 50:
            label, color = "Moderate", "#f59e0b"
        elif total < 75:
            label, color = "Aggressive", "#f97316"
        else:
            label, color = "Very High Risk", "#f43f5e"
        return {"score": round(total, 1), "label": label, "color": color}

    @staticmethod
    def calculate_holdings_breakdown(df: pd.DataFrame) -> List[Dict[str, Any]]:
        """
        Per-holding detail rows.

        return_pct uses adj_return_pct (split-adjusted) so a 10:1 split does
        not make a holding look like it lost 90%.
        pnl / current_value are derived from the same adjusted return applied
        to the actual cost basis (quantity × csv_price) so rupee figures are
        also split-correct.
        """
        df = df.copy()
        df["purchase_value"] = df["quantity"] * df["price"]
        # Split-correct current value: cost_basis × (1 + adj_return)
        df["current_value"] = df["purchase_value"] * (1 + df["adj_return_pct"] / 100)
        df["pnl"]           = df["current_value"] - df["purchase_value"]
        df["return_pct"]    = df["adj_return_pct"]          # already split-adjusted
        total_val = df["current_value"].sum()
        df["weight_pct"] = (df["current_value"] / total_val * 100) if total_val > 0 else 0.0
        df = df.sort_values("current_value", ascending=False)
        return [
            {
                "ticker":         str(r["ticker"]),
                "sector":         str(r.get("sector", "Other")),
                "quantity":       float(r["quantity"]),
                "purchase_price": round(float(r["price"]), 2),
                "current_price":  round(float(r["current_price"]), 2),
                "purchase_value": round(float(r["purchase_value"]), 2),
                "current_value":  round(float(r["current_value"]), 2),
                "pnl":            round(float(r["pnl"]), 2),
                "return_pct":     round(float(r["return_pct"]), 2),
                "weight_pct":     round(float(r["weight_pct"]), 2),
            }
            for _, r in df.iterrows()
        ]

    @staticmethod
    def calculate_top_performers(
        df: pd.DataFrame, top_n: int = 5
    ) -> Tuple[List[Dict], List[Dict]]:
        """
        Top gainers and losers ranked by split-adjusted return (adj_return_pct).
        P&L in ₹ is also derived from the adjusted return applied to cost basis.
        """
        df = df.copy()
        df["purchase_cost"] = df["quantity"] * df["price"]
        df["pnl"]           = df["purchase_cost"] * (df["adj_return_pct"] / 100)
        df = df.sort_values("adj_return_pct", ascending=False)
        gainers = [
            {
                "ticker":     str(r["ticker"]),
                "return_pct": round(float(r["adj_return_pct"]), 2),
                "pnl":        round(float(r["pnl"]), 2),
                "sector":     str(r.get("sector", "Other")),
            }
            for _, r in df.head(top_n).iterrows()
        ]
        losers = [
            {
                "ticker":     str(r["ticker"]),
                "return_pct": round(float(r["adj_return_pct"]), 2),
                "pnl":        round(float(r["pnl"]), 2),
                "sector":     str(r.get("sector", "Other")),
            }
            for _, r in df.tail(top_n).sort_values("adj_return_pct").iterrows()
        ]
        return gainers, losers

    @staticmethod
    def calculate_cost_basis(df: pd.DataFrame) -> float:
        return round(float((df["quantity"] * df["price"]).sum()), 2)

    @staticmethod
    def calculate_portfolio_age(df: pd.DataFrame) -> Dict[str, Any]:
        now = pd.Timestamp.now().tz_localize(None)
        try:
            dates = pd.to_datetime(df["purchase_date"]).dt.tz_localize(None)
            days = (now - dates).dt.days
            return {
                "oldest_holding_days": int(days.max()),
                "newest_holding_days": int(days.min()),
                "avg_holding_days": int(days.mean()),
            }
        except Exception:
            return {"oldest_holding_days": 0, "newest_holding_days": 0, "avg_holding_days": 0}

    # ── Main entry point ───────────────────────────────────────────────────────

    @staticmethod
    def analyze_portfolio(df: pd.DataFrame) -> Dict[str, Any]:
        """
        Full pipeline:
          1. Validate CSV shape.
          2. Normalise column names / types.
          3. Enrich with live yfinance current prices + sector labels.
          4. Compute all deterministic metrics from the enriched data.

        Args:
            df: Raw portfolio DataFrame (from CSV upload).

        Returns:
            Dict with all metrics matching PortfolioSummaryResponse schema.

        Raises:
            ValueError: If validation fails or the enriched DataFrame is empty.
        """
        is_valid, err = PortfolioAnalyzer.validate_portfolio_data(df)
        if not is_valid:
            raise ValueError(err)

        df = PortfolioAnalyzer.normalize_dataframe(df)
        if df.empty:
            raise ValueError(
                "No valid holdings after cleaning. Check for missing or zero values."
            )

        # ── Live data enrichment ──────────────────────────────────────────────
        df = _enrich_dataframe(df)

        # ── Compute metrics ───────────────────────────────────────────────────
        gainers, losers = PortfolioAnalyzer.calculate_top_performers(df)
        sharpe = PortfolioAnalyzer.calculate_sharpe_ratio(df)
        max_dd = PortfolioAnalyzer.calculate_max_drawdown(df)
        var_95 = PortfolioAnalyzer.calculate_var_95(df)
        volatility = PortfolioAnalyzer.calculate_portfolio_volatility(df)
        total_return = PortfolioAnalyzer.calculate_total_return(df)
        cost_basis = PortfolioAnalyzer.calculate_cost_basis(df)
        # Split-correct portfolio value: cost_basis × (1 + adj_return)
        # Using raw quantity × current_price is wrong after a stock split because
        # quantity in the CSV is pre-split (e.g. 1 share at ₹25 000) while
        # current_price is post-split (e.g. ₹2 200 for 1/10th share).
        portfolio_value = round(
            float(
                (df["quantity"] * df["price"] * (1 + df["adj_return_pct"] / 100)).sum()
            ),
            2,
        )

        metrics: Dict[str, Any] = {
            # Core time-return metrics
            "total_return_cumulative": total_return,
            "annualized_return": PortfolioAnalyzer.calculate_annualized_return(df),
            "sharpe_ratio": sharpe,
            "max_drawdown": max_dd,
            "value_at_risk_95": var_95,
            "annualized_volatility": volatility,

            # Summary
            "portfolio_value": portfolio_value,
            "total_cost_basis": cost_basis,
            "total_holdings": len(df),
            "total_pnl": round(portfolio_value - cost_basis, 2),

            # Allocation & risk
            "sector_allocation": PortfolioAnalyzer.calculate_sector_allocation(df),
            "concentration_risk": PortfolioAnalyzer.calculate_concentration_risk(df),
            "win_rate": PortfolioAnalyzer.calculate_win_rate(df),
            "risk_score": PortfolioAnalyzer.calculate_risk_score(sharpe, max_dd, var_95, volatility),
            "portfolio_age": PortfolioAnalyzer.calculate_portfolio_age(df),

            # Holdings detail
            "top_gainers": gainers,
            "top_losers": losers,
            "holdings_breakdown": PortfolioAnalyzer.calculate_holdings_breakdown(df),
        }

        logger.info(
            "Portfolio analysis complete — %d holdings, value=%.2f, return=%.2f%%",
            len(df), portfolio_value, total_return,
        )
        return metrics

    @staticmethod
    def get_portfolio_summary_text(metrics: Dict[str, Any]) -> str:
        """Human-readable summary for logging / LLM context injection."""
        alloc = "\n".join(
            f"  {s}: {p}%" for s, p in metrics.get("sector_allocation", {}).items()
        )
        cr = metrics.get("concentration_risk", {})
        wr = metrics.get("win_rate", {})
        rs = metrics.get("risk_score", {})
        return (
            f"PORTFOLIO ANALYSIS SUMMARY\n"
            f"==========================\n"
            f"Total Return (Cumulative): {metrics['total_return_cumulative']}%\n"
            f"Annualized Return:         {metrics.get('annualized_return', 'N/A')}%\n"
            f"Total P&L:                 ₹{metrics.get('total_pnl', 0):,.2f}\n"
            f"Sharpe Ratio:              {metrics['sharpe_ratio']}\n"
            f"Annualized Volatility:     {metrics.get('annualized_volatility', 'N/A')}%\n"
            f"Max Drawdown:              {metrics['max_drawdown']}%\n"
            f"Value at Risk (95%):       {metrics['value_at_risk_95']}%\n"
            f"Portfolio Value:           ₹{metrics['portfolio_value']:,.2f}\n"
            f"Cost Basis:                ₹{metrics.get('total_cost_basis', 0):,.2f}\n"
            f"Total Holdings:            {metrics['total_holdings']}\n"
            f"Win Rate:                  {wr.get('win_rate', 0)}% "
            f"({wr.get('winners', 0)}W / {wr.get('losers', 0)}L)\n"
            f"Concentration Risk:        {cr.get('level', 'N/A')} (HHI: {cr.get('hhi', 0)})\n"
            f"Overall Risk Score:        {rs.get('score', 0)}/100 ({rs.get('label', 'N/A')})\n"
            f"\nSector Allocation:\n{alloc}\n"
        )


# Singleton instance
portfolio_analyzer = PortfolioAnalyzer()
