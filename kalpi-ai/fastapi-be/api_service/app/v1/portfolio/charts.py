"""
Portfolio Charts Endpoint
POST /v1/portfolio/charts - Compute time-series chart data for a portfolio
"""

import logging
from fastapi import Request
from fastapi.responses import JSONResponse

from app.schemas.portfolio import ChartDataRequest, ChartDataResponse
from services.portfolio_charts import get_chart_data

logger = logging.getLogger(__name__)

ROUTE_CONFIG = {
    "tags": ["Portfolio"],
    "post": {
        "summary": "Get Portfolio Chart Data",
        "description": (
            "Fetches historical prices via yfinance and returns cumulative returns, "
            "rolling volatility, and sector allocation ready for Plotly charts."
        ),
        "response_model": ChartDataResponse,
    },
}


async def post(request: Request, body: ChartDataRequest) -> JSONResponse:
    try:
        portfolio_list = [
            {"ticker": item.ticker, "weight": item.weight}
            for item in body.portfolio
        ]
        data = get_chart_data(
            portfolio=portfolio_list,
            exchange_str=body.exchange,
            period=body.period,
            rolling_window=body.rolling_window,
        )
        return JSONResponse(content=data)
    except Exception as exc:
        logger.exception("Chart data computation failed")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Chart data computation failed: {exc}"},
        )
