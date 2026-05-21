"""
Portfolio Agent Chat Endpoint
POST /v1/portfolio/agent/chat - Run the LangGraph portfolio agent
"""

import logging
from fastapi import Request
from fastapi.responses import JSONResponse

from app.schemas.portfolio import AgentChatRequest, AgentChatResponse
from agents import run_agent_async

logger = logging.getLogger(__name__)

ROUTE_CONFIG = {
    "tags": ["Portfolio"],
    "post": {
        "summary": "Portfolio Agent Chat",
        "description": (
            "Send a message to the LangGraph portfolio agent. "
            "Returns a natural language response plus chart type and data."
        ),
        "response_model": AgentChatResponse,
    },
}


async def post(request: Request, body: AgentChatRequest) -> JSONResponse:
    try:
        portfolio_list = [
            {"ticker": item.ticker, "weight": item.weight}
            for item in body.portfolio
        ]

        history = [
            {"role": msg.role, "content": msg.content}
            for msg in body.chat_history
        ]

        # Agent expects "NSE"/"BSE"; schema uses yfinance suffix "NS"/"BO"
        agent_exchange = "NSE" if body.exchange == "NS" else "BSE"

        result = await run_agent_async(
            portfolio=portfolio_list,
            user_message=body.message,
            chat_history=history,
            exchange=agent_exchange,
            period=body.period,
        )

        return JSONResponse(
            content={
                "message": result.message,
                "chart_type": result.chart_type,
                "chart_data": result.chart_data,
                "suggestions": result.suggestions,
            }
        )
    except Exception as exc:
        logger.exception("Agent chat failed")
        return JSONResponse(
            status_code=200,  # return 200 with a fallback so UI doesn't crash
            content={
                "message": (
                    "I'm sorry, I couldn't complete that analysis. "
                    "Please check the server logs or try again."
                ),
                "chart_type": "none",
                "chart_data": None,
                "suggestions": [],
            },
        )
