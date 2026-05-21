"""
Portfolio Chat History Endpoint
GET /v1/portfolio/history

Returns metadata for all chat sessions, sorted newest-first.
No authentication required — all sessions are accessible openly.
"""

from __future__ import annotations

import logging

from fastapi import Request

from app.schemas.portfolio import ChatSessionHistoryResponse, ChatSessionMeta
from core.database.mongo import get_database

logger = logging.getLogger(__name__)

ROUTE_CONFIG = {
    "tags": ["Portfolio Chat"],
    "get": {
        "summary": "List Chat Sessions",
        "description": (
            "Return metadata for all past chat sessions, sorted newest-first. "
            "Does not include message bodies."
        ),
        "response_model": ChatSessionHistoryResponse,
    },
}


async def get(request: Request) -> ChatSessionHistoryResponse:
    """Fetch all chat session metadata."""
    db = get_database()
    cursor = (
        db.chat_sessions.find(
            {},
            {
                "session_id":           1,
                "portfolio_tickers":    1,
                "message_count":        1,
                "last_message_preview": 1,
                "created_at":           1,
                "updated_at":           1,
                "_id":                  0,
            },
        )
        .sort("updated_at", -1)
        .limit(200)
    )
    docs = await cursor.to_list(length=200)
    sessions = [ChatSessionMeta(**doc) for doc in docs]
    return ChatSessionHistoryResponse(sessions=sessions, total=len(sessions))
