"""
Portfolio Upload Endpoint
POST /v1/portfolio/upload — Accept CSV file and analyse portfolio.
No authentication required.
"""

import io
import logging
import uuid
from datetime import datetime

import pandas as pd
from fastapi import File, Request, UploadFile
from fastapi.responses import JSONResponse

from app.schemas.portfolio import PortfolioSummaryResponse
from core.database.mongo import get_database
from services.portfolio_analyzer import PortfolioAnalyzer

logger = logging.getLogger(__name__)

ROUTE_CONFIG = {
    "tags": ["Portfolio"],
    "post": {
        "summary": "Upload and Analyse Portfolio",
        "description": (
            "Upload a CSV portfolio file containing 'Ticker', 'Quantity', and 'Price' "
            "columns. Returns portfolio metrics and a session ID."
        ),
        "response_model": PortfolioSummaryResponse,
    },
}


async def post(
    request: Request,
    file: UploadFile = File(...),
):
    """Upload a portfolio CSV file and perform deterministic analysis."""

    # ── 1. Validate file format ───────────────────────────────────────────────
    if not file.filename:
        return JSONResponse(status_code=400, content={"detail": "File name is required"})

    if not file.filename.lower().endswith(".csv"):
        return JSONResponse(
            status_code=400,
            content={"detail": "Only CSV files are supported. Please upload a .csv file."},
        )

    # ── 2. Read file into memory ──────────────────────────────────────────────
    content = await file.read()
    if not content:
        return JSONResponse(status_code=400, content={"detail": "Uploaded file is empty"})

    try:
        portfolio_df = pd.read_csv(io.BytesIO(content))
        logger.info("CSV read successfully. Shape: %s", portfolio_df.shape)
    except pd.errors.ParserError as exc:
        logger.error("CSV parsing error: %s", exc)
        return JSONResponse(status_code=400, content={"detail": f"Invalid CSV format: {exc}"})
    except Exception as exc:
        logger.error("Error reading file: %s", exc)
        return JSONResponse(status_code=400, content={"detail": f"Error processing file: {exc}"})

    # ── 3. Validate data ──────────────────────────────────────────────────────
    is_valid, error_msg = PortfolioAnalyzer.validate_portfolio_data(portfolio_df)
    if not is_valid:
        logger.warning("Portfolio validation failed: %s", error_msg)
        return JSONResponse(status_code=400, content={"detail": error_msg})

    # ── 4. Analyse portfolio ──────────────────────────────────────────────────
    try:
        metrics = PortfolioAnalyzer.analyze_portfolio(portfolio_df)
        logger.info("Analysis complete. Total return: %s%%", metrics["total_return_cumulative"])
    except ValueError as exc:
        logger.error("Analysis validation error: %s", exc)
        return JSONResponse(
            status_code=400,
            content={"detail": f"Portfolio analysis failed: {exc}"},
        )
    except Exception as exc:
        logger.error("Portfolio analysis error: %s", exc)
        return JSONResponse(
            status_code=400,
            content={"detail": "Internal error during portfolio analysis"},
        )

    # ── 5. Generate session ID ────────────────────────────────────────────────
    session_id = str(uuid.uuid4())
    logger.info("Generated session_id: %s", session_id)

    # ── 6. Store in MongoDB ───────────────────────────────────────────────────
    try:
        db = get_database()
        clean_df = portfolio_df.where(pd.notnull(portfolio_df), None)
        portfolio_doc = {
            "session_id":       session_id,
            "file_name":        file.filename,
            "portfolio_data":   clean_df.to_dict("records"),
            "metrics":          metrics,
            "uploaded_at":      datetime.utcnow(),
            "raw_csv_content":  content.decode("utf-8"),
        }
        result = await db.portfolios.insert_one(portfolio_doc)
        logger.info("Stored in MongoDB: %s", result.inserted_id)

        if not hasattr(request.app.state, "portfolio_sessions"):
            request.app.state.portfolio_sessions = {}
        request.app.state.portfolio_sessions[session_id] = portfolio_df

    except Exception as exc:
        logger.error("MongoDB storage error: %s", exc)
        # Continue — metrics are computed; session just won't be persisted.

    # ── 7. Return response ────────────────────────────────────────────────────
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
