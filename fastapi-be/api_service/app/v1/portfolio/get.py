"""
Portfolio Get Endpoint
GET /v1/portfolio/get?session_id=... — Fetch a specific portfolio analysis.
No authentication required.
"""

import logging

from fastapi import Query, Request
from fastapi.responses import JSONResponse

from app.schemas.portfolio import PortfolioSummaryResponse
from core.database.mongo import get_database

logger = logging.getLogger(__name__)

ROUTE_CONFIG = {
    "tags": ["Portfolio"],
    "get": {
        "summary": "Get Specific Portfolio Analysis",
        "description": "Retrieve full portfolio metrics by session ID.",
        "response_model": PortfolioSummaryResponse,
    },
}


async def get(
    request: Request,
    session_id: str = Query(..., description="Session ID of the portfolio to retrieve"),
):
    """Retrieve a full portfolio analysis from MongoDB by session ID."""
    try:
        db = get_database()
        portfolio = await db.portfolios.find_one({"session_id": session_id})

        if not portfolio:
            return JSONResponse(
                status_code=404,
                content={"detail": "Portfolio not found"},
            )

        metrics = portfolio.get("metrics", {})
        return PortfolioSummaryResponse(
            session_id=session_id,
            total_return_cumulative=metrics.get("total_return_cumulative", 0),
            annualized_return=metrics.get("annualized_return", 0),
            sharpe_ratio=metrics.get("sharpe_ratio", 0),
            max_drawdown=metrics.get("max_drawdown", 0),
            value_at_risk_95=metrics.get("value_at_risk_95", 0),
            annualized_volatility=metrics.get("annualized_volatility", 0),
            sector_allocation=metrics.get("sector_allocation", {}),
            portfolio_value=metrics.get("portfolio_value", 0),
            total_cost_basis=metrics.get("total_cost_basis", 0),
            total_pnl=metrics.get("total_pnl", 0),
            total_holdings=metrics.get("total_holdings", 0),
            concentration_risk=metrics.get("concentration_risk", {}),
            win_rate=metrics.get("win_rate", {}),
            risk_score=metrics.get("risk_score", {}),
            portfolio_age=metrics.get("portfolio_age", {}),
            top_gainers=metrics.get("top_gainers", []),
            top_losers=metrics.get("top_losers", []),
            holdings_breakdown=metrics.get("holdings_breakdown", []),
        )

    except Exception as exc:
        logger.error("Error fetching portfolio %s: %s", session_id, exc)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal error fetching portfolio"},
        )
