"""
Portfolio service integration tests — live yfinance data, zero mocks.
======================================================================
Every test hits yfinance directly (or validates service-layer code against
real yfinance responses).  No hardcoded prices, no dummy returns.

Run from the api_service root:

    cd fastapi-be/api_service
    pytest tests/test_portfolio.py -v --timeout=60

Requirements:
    pip install pytest pytest-timeout yfinance pandas
"""

from __future__ import annotations

import io

import pandas as pd
import pytest
import yfinance as yf


# ─── 1. yfinance connectivity ──────────────────────────────────────────────────

def test_yfinance_nse_ticker_returns_data():
    """yfinance can reach Yahoo Finance and return price history for RELIANCE.NS."""
    hist = yf.Ticker("RELIANCE.NS").history(period="5d", interval="1d", auto_adjust=True)
    assert not hist.empty, "Expected RELIANCE.NS history — got empty DataFrame"
    assert "Close" in hist.columns
    assert hist["Close"].dropna().iloc[-1] > 0, "Close price must be positive"


def test_yfinance_multiple_nse_tickers():
    """yfinance returns non-empty price history for common NSE tickers."""
    for symbol in ("TCS.NS", "INFY.NS", "HDFCBANK.NS"):
        hist = yf.Ticker(symbol).history(period="5d", auto_adjust=True)
        assert not hist.empty, f"Expected price data for {symbol}"
        assert hist["Close"].dropna().iloc[-1] > 0, f"Non-positive close for {symbol}"


def test_yfinance_ticker_info_has_sector():
    """Ticker.info carries a sector or industry field for well-known tickers."""
    info   = yf.Ticker("TCS.NS").info
    sector = info.get("sector") or info.get("industry")
    assert sector, (
        f"Expected sector/industry in TCS.NS info, got sector={info.get('sector')!r}"
    )


# ─── 2. PortfolioAnalyzer — full pipeline ─────────────────────────────────────

@pytest.fixture(scope="module")
def sample_csv_bytes() -> bytes:
    """
    Minimal NSE portfolio CSV.
    'Price' is the purchase price; current_price is intentionally absent
    so the analyzer fetches it live from yfinance.
    """
    csv_text = (
        "Ticker,Quantity,Price,Sector,Purchase_Date\n"
        "RELIANCE,10,2400.00,Energy,2023-06-01\n"
        "TCS,5,3200.00,Technology,2023-08-15\n"
        "HDFCBANK,20,1500.00,Financials,2023-04-10\n"
    )
    return csv_text.encode()


@pytest.fixture(scope="module")
def enriched_metrics(sample_csv_bytes):
    """Run analyze_portfolio once and cache the result for all dependent tests."""
    from services.portfolio_analyzer import PortfolioAnalyzer

    df = pd.read_csv(io.BytesIO(sample_csv_bytes))
    return PortfolioAnalyzer.analyze_portfolio(df)


def test_analyze_portfolio_returns_all_keys(enriched_metrics):
    """analyze_portfolio must return every key the frontend dashboard expects."""
    required = {
        "total_return_cumulative",
        "annualized_return",
        "sharpe_ratio",
        "max_drawdown",
        "value_at_risk_95",
        "annualized_volatility",
        "portfolio_value",
        "total_cost_basis",
        "total_pnl",
        "total_holdings",
        "sector_allocation",
        "concentration_risk",
        "win_rate",
        "risk_score",
        "portfolio_age",
        "top_gainers",
        "top_losers",
        "holdings_breakdown",
    }
    missing = required - set(enriched_metrics.keys())
    assert not missing, f"analyze_portfolio missing keys: {missing}"


def test_portfolio_value_reflects_live_prices(enriched_metrics, sample_csv_bytes):
    """
    portfolio_value must use live yfinance prices, not the CSV purchase prices.
    The two values should differ (unless the market froze — extremely unlikely).
    """
    df           = pd.read_csv(io.BytesIO(sample_csv_bytes))
    static_value = float((df["Quantity"] * df["Price"]).sum())
    live_value   = enriched_metrics["portfolio_value"]

    assert live_value > 0, f"Live portfolio_value must be positive, got {live_value}"
    assert live_value != static_value, (
        "portfolio_value equals the static CSV value — "
        "live prices were not applied by yfinance"
    )


def test_total_holdings_count(enriched_metrics):
    assert enriched_metrics["total_holdings"] == 3


def test_sector_allocation_sums_to_100(enriched_metrics):
    alloc = enriched_metrics["sector_allocation"]
    assert isinstance(alloc, dict) and len(alloc) > 0
    total = sum(alloc.values())
    assert abs(total - 100.0) < 0.5, f"Sector allocation sums to {total:.2f}, expected ≈100"


def test_holdings_breakdown_has_live_price(enriched_metrics):
    """Every holding must carry a current_price > 0 (fetched from yfinance)."""
    for h in enriched_metrics["holdings_breakdown"]:
        assert h["current_price"] > 0, (
            f"{h['ticker']} has non-positive current_price {h['current_price']}"
        )


def test_concentration_risk_structure(enriched_metrics):
    cr = enriched_metrics["concentration_risk"]
    assert {"hhi", "level", "top_positions"} <= set(cr.keys())
    assert 0 < cr["hhi"] <= 1.0
    assert cr["level"] in (
        "Well Diversified", "Moderately Concentrated", "Highly Concentrated"
    )


def test_win_rate_structure(enriched_metrics):
    wr = enriched_metrics["win_rate"]
    assert 0 <= wr["win_rate"] <= 100
    assert wr["winners"] + wr["losers"] + wr["flat"] == wr["total"]


def test_risk_score_in_range(enriched_metrics):
    rs = enriched_metrics["risk_score"]
    assert 0 <= rs["score"] <= 100
    assert rs["label"] in ("Conservative", "Moderate", "Aggressive", "Very High Risk")
    assert rs["color"].startswith("#")


def test_top_gainers_and_losers(enriched_metrics):
    for h in enriched_metrics["top_gainers"] + enriched_metrics["top_losers"]:
        assert {"ticker", "return_pct", "pnl"} <= set(h.keys())


# ─── 3. portfolio_math — fetch helpers ────────────────────────────────────────

def test_fetch_historical_prices_returns_ohlcv():
    """fetch_historical_prices must return a DataFrame containing a Close column."""
    from services.portfolio_math import Exchange, fetch_historical_prices

    df = fetch_historical_prices("RELIANCE", Exchange.NSE, period="3mo", interval="1d")
    assert not df.empty
    assert "Close" in df.columns
    assert df["Close"].dropna().iloc[-1] > 0


def test_fetch_historical_prices_invalid_ticker_raises():
    """An unknown ticker must raise ValueError — not crash silently."""
    from services.portfolio_math import Exchange, fetch_historical_prices

    with pytest.raises(ValueError, match="No price data"):
        fetch_historical_prices("INVALIDTICKER_ZZZZZ", Exchange.NSE, period="1mo")


def test_compute_metrics_from_ticker():
    """compute_metrics_from_ticker must return all six keys with real values."""
    from services.portfolio_math import Exchange, compute_metrics_from_ticker

    metrics = compute_metrics_from_ticker("TCS", Exchange.NSE, period="1y")
    assert {"total_return", "cagr", "annualized_volatility", "var_95",
            "max_drawdown", "sharpe_ratio"} == set(metrics.keys())
    assert isinstance(metrics["cagr"], float)
    assert isinstance(metrics["annualized_volatility"], float)
    assert metrics["annualized_volatility"] >= 0


# ─── 4. ChatResponse schema ────────────────────────────────────────────────────

def test_chat_response_schema_accepts_all_canvas_views():
    """ChatResponse must accept every active_canvas_view value the agent can emit."""
    from app.schemas.portfolio import ChatResponse

    for view in ("performance", "risk", "diversification", "holdings", "none", "comparison", "whatif"):
        resp = ChatResponse(
            bot_response="Analysis complete.",
            active_canvas_view=view,
            canvas_data={"per_ticker": {"RELIANCE": {"cagr_pct": 12.5}}},
            suggestions=["What is my Sharpe ratio?", "Show VaR", "Compare with Nifty"],
            chat_session_id=None,
        )
        assert resp.active_canvas_view == view


def test_chat_response_rejects_invalid_canvas_view():
    """ChatResponse must reject unrecognised active_canvas_view values."""
    from pydantic import ValidationError
    from app.schemas.portfolio import ChatResponse

    with pytest.raises(ValidationError):
        ChatResponse(
            bot_response="test",
            active_canvas_view="TOTALLY_INVALID",
            canvas_data=None,
            suggestions=[],
            chat_session_id=None,
        )
