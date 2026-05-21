"""
Chat Session Endpoints
GET    /v1/portfolio/history/{session_id}  — fetch full session with messages
DELETE /v1/portfolio/history/{session_id}  — hard-delete the session

No authentication required — sessions are keyed only by session_id.
"""

from __future__ import annotations

import logging

from fastapi import HTTPException, Request

from app.schemas.portfolio import DeleteSessionResponse, FullChatSessionResponse
from core.database.mongo import get_database

logger = logging.getLogger(__name__)

ROUTE_CONFIG = {
    "tags": ["Portfolio Chat"],
    "get": {
        "summary": "Get Chat Session",
        "description": (
            "Fetch a single chat session with all stored message turns "
            "and the last known portfolio snapshot."
        ),
        "response_model": FullChatSessionResponse,
    },
    "delete": {
        "summary": "Delete Chat Session",
        "description": "Permanently delete a chat session (all messages + portfolio snapshot).",
        "response_model": DeleteSessionResponse,
    },
}


async def get(request: Request, session_id: str) -> FullChatSessionResponse:
    """Fetch a single chat session with its full message history."""
    db = get_database()
    doc = await db.chat_sessions.find_one(
        {"session_id": session_id},
        {"_id": 0},
    )

    if not doc:
        raise HTTPException(status_code=404, detail="Chat session not found.")

    doc.setdefault("messages", [])
    doc.setdefault("portfolio_snapshot", [])
    doc.setdefault("portfolio_tickers", [])
    doc.setdefault("message_count", 0)

    logger.debug("Fetched session %s", session_id)
    return FullChatSessionResponse(**doc)


async def delete(request: Request, session_id: str) -> DeleteSessionResponse:
    """Delete a chat session by session_id."""
    db = get_database()
    result = await db.chat_sessions.delete_one({"session_id": session_id})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Chat session not found.")

    logger.info("Deleted chat session %s", session_id)
    return DeleteSessionResponse(
        deleted=True,
        session_id=session_id,
        message="Chat session deleted successfully.",
    )
