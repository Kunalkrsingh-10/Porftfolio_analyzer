"""
Portfolio Chat Endpoint
POST /v1/portfolio/chat

Runs the LangGraph portfolio agent (via run_agent_async) with live market
data fetched by yfinance inside each tool call.  Every conversation turn
(user message + assistant response + portfolio snapshot) is persisted to
the `chat_sessions` MongoDB collection, keyed by a stable chat_session_id
(UUID4).  Prior turns are loaded from MongoDB and fed into run_agent_async
so the LLM has full multi-turn context.

No authentication required — all requests are accepted openly.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

import pandas as pd
from fastapi import HTTPException, Request

from agents import run_agent_async
from app.schemas.portfolio import ChatRequest, ChatResponse
from core.database.mongo import get_database

logger = logging.getLogger(__name__)

ROUTE_CONFIG = {
    "tags": ["Portfolio Chat"],
    "post": {
        "summary": "Chat with Portfolio AI Agent",
        "description": (
            "Send a natural-language question to the LangGraph portfolio agent. "
            "The agent fetches live market data via yfinance, computes financial "
            "metrics (CAGR, Sharpe, VaR, MDD, What-If), and returns a structured "
            "JSON response that drives the Next.js dashboard canvas charts. "
            "Each turn is persisted to MongoDB; pass the returned "
            "`chat_session_id` in subsequent requests to maintain conversation context."
        ),
        "response_model": ChatResponse,
    },
}

# Agent chart_type → frontend active_canvas_view.
# 'comparison' and 'whatif' are passed through verbatim — both are valid
# values in the ChatResponse.active_canvas_view schema pattern and the
# frontend canvas handles them as distinct views.  Mapping them to
# 'performance' was causing the canvas to show the wrong chart and, for
# single-stock responses with chart_type='comparison', roll back to blank.
_CHART_TYPE_TO_CANVAS: dict[str, str] = {
    "performance": "performance",
    "risk":        "risk",
    "comparison":  "comparison",
    "whatif":      "whatif",
    "none":        "none",
}

_FALLBACK_RESPONSE = ChatResponse(
    bot_response=(
        "I'm sorry, I couldn't process your request right now. "
        "Please try again in a moment."
    ),
    active_canvas_view="none",
    canvas_data=None,
    suggestions=[],
    chat_session_id=None,
)


def _build_portfolio_list(portfolio_df: pd.DataFrame) -> list[dict]:
    """
    Convert a portfolio DataFrame (Ticker, Quantity, Price) into
    [{"ticker": str, "weight": float}] normalised so weights sum to 1.
    """
    portfolio_df = portfolio_df.copy()
    portfolio_df.columns = [str(c).strip().title() for c in portfolio_df.columns]

    price_col = "Currentprice" if "Currentprice" in portfolio_df.columns else "Price"

    portfolio_df["_value"] = (
        pd.to_numeric(portfolio_df.get("Quantity", 1), errors="coerce").fillna(0)
        * pd.to_numeric(portfolio_df.get(price_col, 1), errors="coerce").fillna(0)
    )

    total = portfolio_df["_value"].sum()
    if total <= 0:
        return []

    return [
        {
            "ticker": str(row["Ticker"]).strip().upper(),
            "weight": float(row["_value"] / total),
        }
        for _, row in portfolio_df.iterrows()
        if row["_value"] > 0 and str(row.get("Ticker", "")).strip()
    ]


async def _persist_turn(
    *,
    chat_session_id: str,
    user_message: str,
    portfolio_list: list[dict],
    ai_message: str,
    chart_type: str,
    suggestions: list[str],
) -> None:
    """
    Upsert the user+assistant turn into `chat_sessions`.
    Keyed only by session_id — no user_id scoping.
    """
    now = datetime.now(timezone.utc)

    user_turn = {"role": "user", "content": user_message, "timestamp": now}
    assistant_turn = {
        "role":        "assistant",
        "content":     ai_message,
        "timestamp":   datetime.now(timezone.utc),
        "chart_type":  chart_type,
        "suggestions": suggestions,
    }

    db = get_database()
    await db.chat_sessions.update_one(
        {"session_id": chat_session_id},
        {
            "$push": {"messages": {"$each": [user_turn, assistant_turn]}},
            "$inc":  {"message_count": 2},
            "$set": {
                "updated_at":           now,
                "portfolio_snapshot":   portfolio_list,
                "portfolio_tickers":    [p["ticker"] for p in portfolio_list],
                "last_message_preview": user_message[:200],
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    logger.debug("Persisted turn to chat_sessions — session=%s", chat_session_id)


async def _load_chat_history(chat_session_id: str) -> list[dict]:
    """
    Load prior conversation turns from MongoDB for this chat session.
    Returns [] on any error or if the session doesn't exist yet.
    """
    try:
        db = get_database()
        doc = await db.chat_sessions.find_one(
            {"session_id": chat_session_id},
            {"messages": 1, "_id": 0},
        )
        if not doc or not doc.get("messages"):
            return []
        history: list[dict] = []
        for msg in doc["messages"]:
            role    = msg.get("role", "")
            content = msg.get("content", "")
            if role in ("user", "assistant") and content:
                history.append({"role": role, "content": content})
        return history
    except Exception as exc:
        logger.warning(
            "Non-fatal: could not load chat history for session=%s: %s",
            chat_session_id, exc,
        )
        return []


async def post(request: Request, body: ChatRequest) -> ChatResponse:
    """
    Main chat handler.

    Flow:
      1. Resolve portfolio (inline body.portfolio > DB session > empty).
      2. Load prior conversation turns from MongoDB.
      3. Call run_agent_async — live yfinance data, no mock data.
      4. Map agent chart_type → frontend active_canvas_view.
      5. Persist the new turn to MongoDB (best-effort).
      6. Return ChatResponse.
    """

    chat_session_id: str = body.chat_session_id or str(uuid.uuid4())
    session_id   = body.session_id
    user_message = body.user_message

    logger.info(
        "Chat — chat_session=%s portfolio_session=%s msg=%.80s",
        chat_session_id, session_id, user_message,
    )

    # ── 1. Resolve portfolio ──────────────────────────────────────────────────
    portfolio_list: list[dict] = []

    if body.portfolio:
        raw_items: list[dict] = []
        for item in body.portfolio:
            ticker = str(item.get("ticker", "")).strip().upper()
            try:
                weight = float(item.get("weight", 0))
            except (TypeError, ValueError):
                weight = 0.0
            if ticker and weight > 0:
                raw_items.append({"ticker": ticker, "weight": weight})

        total_w = sum(r["weight"] for r in raw_items)
        if total_w > 0:
            portfolio_list = [
                {"ticker": r["ticker"], "weight": r["weight"] / total_w}
                for r in raw_items
            ]
        logger.info(
            "Using inline portfolio (%d holdings) for chat_session=%s",
            len(portfolio_list), chat_session_id,
        )

    elif session_id:
        try:
            db = get_database()
            portfolio_doc = await db.portfolios.find_one({"session_id": session_id})
            if not portfolio_doc:
                raise HTTPException(
                    status_code=404,
                    detail="Portfolio session not found or expired. Please re-upload.",
                )
            portfolio_df   = pd.DataFrame(portfolio_doc["portfolio_data"])
            portfolio_list = _build_portfolio_list(portfolio_df)
            logger.info(
                "Loaded portfolio from DB session=%s (%d holdings)",
                session_id, len(portfolio_list),
            )
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("Error loading portfolio for session %s: %s", session_id, exc)
            raise HTTPException(status_code=500, detail="Error retrieving portfolio data")

    # ── 2. Load prior chat history ────────────────────────────────────────────
    chat_history = await _load_chat_history(chat_session_id)
    if chat_history:
        logger.debug(
            "Loaded %d prior turns for chat_session=%s",
            len(chat_history), chat_session_id,
        )

    # ── 3. Run LangGraph agent ────────────────────────────────────────────────
    # Map frontend period labels (1M, 3M, 6M, 1Y, 2Y, 3Y) → yfinance strings
    _PERIOD_MAP: dict[str, str] = {
        "1M": "1mo", "3M": "3mo", "6M": "6mo",
        "1Y": "1y",  "2Y": "2y",  "3Y": "3y",
    }
    resolved_period = _PERIOD_MAP.get((body.period or "1Y").upper(), body.period or "1y")
    resolved_exchange = (body.exchange or "NSE").upper()

    try:
        result = await run_agent_async(
            user_message=user_message,
            portfolio=portfolio_list,
            chat_history=chat_history,
            exchange=resolved_exchange,
            period=resolved_period,
        )
        logger.info(
            "Agent chart_type=%s suggestions=%d session=%s",
            result.chart_type, len(result.suggestions), chat_session_id,
        )
    except Exception:
        logger.exception("Agent run failed — chat_session=%s", chat_session_id)
        return _FALLBACK_RESPONSE.model_copy(
            update={"chat_session_id": chat_session_id}
        )

    # ── 4. Map chart_type → canvas view ──────────────────────────────────────
    active_canvas = _CHART_TYPE_TO_CANVAS.get(result.chart_type, "none")
    canvas_data   = result.chart_data

    # ── 5. Persist turn (best-effort) ─────────────────────────────────────────
    try:
        await _persist_turn(
            chat_session_id=chat_session_id,
            user_message=user_message,
            portfolio_list=portfolio_list,
            ai_message=result.message,
            chart_type=result.chart_type,
            suggestions=result.suggestions,
        )
    except Exception as exc:
        logger.error(
            "Non-fatal: failed to persist chat turn — session=%s: %s",
            chat_session_id, exc,
        )

    # ── 6. Return response ────────────────────────────────────────────────────
    return ChatResponse(
        bot_response=result.message,
        active_canvas_view=active_canvas,
        canvas_data=canvas_data,
        suggestions=result.suggestions,
        chat_session_id=chat_session_id,
    )
