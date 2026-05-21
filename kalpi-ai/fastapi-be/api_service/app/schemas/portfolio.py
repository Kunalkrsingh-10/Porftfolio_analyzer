"""
Portfolio Request/Response Schemas
Pydantic models for strict validation and documentation
"""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator
from typing import Dict, Any, Optional, List, Literal
from datetime import datetime


class PortfolioHolding(BaseModel):
    """Single stock holding in a portfolio"""
    ticker: str = Field(..., description="Stock ticker symbol", min_length=1, max_length=10)
    quantity: float = Field(..., description="Number of shares owned", gt=0)
    price: float = Field(..., description="Purchase price per share", gt=0)
    current_price: Optional[float] = Field(None, description="Current price per share", gt=0)
    sector: Optional[str] = Field("Other", description="Industry sector")
    purchase_date: Optional[datetime] = Field(None, description="Date of purchase")
    
    @field_validator('ticker')
    @classmethod
    def validate_ticker(cls, v):
        return v.upper().strip()


class TopPerformer(BaseModel):
    """A single top-gaining or top-losing holding"""
    ticker: str
    return_pct: float
    pnl: float
    sector: str


class HoldingBreakdown(BaseModel):
    """Detailed breakdown of a single holding"""
    ticker: str
    sector: str
    quantity: float
    purchase_price: float
    current_price: float
    purchase_value: float
    current_value: float
    pnl: float
    return_pct: float
    weight_pct: float


class RiskScore(BaseModel):
    score: float
    label: str
    color: str


class ConcentrationRisk(BaseModel):
    hhi: float
    level: str
    top_positions: List[Dict[str, Any]]


class WinRate(BaseModel):
    win_rate: float
    winners: int
    losers: int
    flat: int
    total: int


class PortfolioAge(BaseModel):
    oldest_holding_days: int
    newest_holding_days: int
    avg_holding_days: int


class PortfolioSummaryResponse(BaseModel):
    """Response from portfolio upload endpoint"""
    session_id: str = Field(..., description="Unique session identifier for this portfolio analysis")
    
    # Core Metrics
    total_return_cumulative: float = Field(..., description="Total return as percentage (e.g., 15.5)")
    annualized_return: float = Field(..., description="Annualized return percentage")
    sharpe_ratio: float = Field(..., description="Risk-adjusted return metric (higher is better)")
    max_drawdown: float = Field(..., description="Maximum drawdown as percentage (e.g., -8.2)")
    value_at_risk_95: float = Field(..., description="Value at Risk at 95% confidence (e.g., -5.1)")
    annualized_volatility: float = Field(..., description="Annualized portfolio volatility")
    
    # Summary
    portfolio_value: float = Field(..., description="Total current portfolio value in dollars")
    total_cost_basis: float = Field(0.0, description="Total initial investment (purchase value)")
    total_pnl: float = Field(..., description="Total profit/loss in dollars")
    total_holdings: int = Field(..., description="Number of stocks in portfolio", ge=1)
    
    # Allocation & Risk
    sector_allocation: Dict[str, float] = Field(..., description="Allocation by sector as percentages")
    concentration_risk: ConcentrationRisk
    win_rate: WinRate
    risk_score: RiskScore
    portfolio_age: PortfolioAge
    
    # Performers & Holdings
    top_gainers: List[TopPerformer] = Field(default_factory=list, description="Top performing holdings")
    top_losers: List[TopPerformer] = Field(default_factory=list, description="Worst performing holdings")
    holdings_breakdown: List[HoldingBreakdown] = Field(default_factory=list, description="Detailed list of all holdings")
    
    class Config:
        json_schema_extra = {
            "example": {
                "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "total_return_cumulative": 15.5,
                "portfolio_value": 500000.0,
                "total_holdings": 15
            }
        }


class ChatRequest(BaseModel):
    """Request body for portfolio chat endpoint."""

    session_id: Optional[str] = Field(
        None,
        description="Portfolio session ID (from upload). Used to load portfolio from DB.",
        min_length=36,
        max_length=36,
    )
    chat_session_id: Optional[str] = Field(
        None,
        description=(
            "Existing chat session ID (UUID4) to continue a previous conversation. "
            "Omit or leave null to start a new session."
        ),
        min_length=36,
        max_length=36,
    )
    user_message: str = Field(
        ...,
        description="Natural language question about the portfolio",
        min_length=1,
        max_length=1000,
    )
    portfolio: Optional[List[Dict[str, Any]]] = Field(
        None,
        description=(
            "Optional inline portfolio for mid-conversation updates. "
            "Each item: {\"ticker\": str, \"weight\": float}. "
            "When provided, overrides the session portfolio from DB."
        ),
    )

    @field_validator("user_message")
    @classmethod
    def validate_message(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Message cannot be empty or whitespace only")
        return v.strip()

    @field_validator("chat_session_id", "session_id", mode="before")
    @classmethod
    def validate_uuid_format(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        import re
        if not re.fullmatch(
            r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
            v,
        ):
            raise ValueError("Must be a valid UUID4 string (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)")
        return v.lower()


class ChatResponse(BaseModel):
    """Response from portfolio chat endpoint."""

    bot_response: str = Field(
        ...,
        description="Natural language response from the AI analyst",
        min_length=1,
        max_length=4000,
    )
    active_canvas_view: str = Field(
        ...,
        description=(
            "Frontend canvas tab to activate. "
            "Values: performance | risk | returns | diversification | holdings | none. "
            "Agent-internal values 'comparison' and 'whatif' are mapped to 'performance' "
            "before this field is set."
        ),
        pattern="^(performance|risk|returns|diversification|holdings|comparison|whatif|none)$",
    )
    canvas_data: Optional[Dict[str, Any]] = Field(
        None,
        description="Data for the requested visualization. Structure depends on active_canvas_view.",
    )
    suggestions: List[str] = Field(
        default_factory=list,
        description="3 contextual follow-up questions for the user.",
    )
    chat_session_id: Optional[str] = Field(
        None,
        description=(
            "Chat session ID (UUID4). Pass this back in subsequent requests "
            "as chat_session_id to continue the conversation."
        ),
    )


class ErrorResponse(BaseModel):
    """Standard error response"""
    detail: str = Field(..., description="Error message")
    error_code: Optional[str] = Field(None, description="Error code for categorization")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="When error occurred")

class PortfolioHistoryItem(BaseModel):
    session_id: str
    file_name: str
    uploaded_at: datetime
    total_return_cumulative: float
    portfolio_value: float
    total_holdings: int

class PortfolioHistoryResponse(BaseModel):
    history: List[PortfolioHistoryItem]


# ── New schemas for chart + agent endpoints ────────────────────────────────────

class PortfolioItem(BaseModel):
    """Single ticker + weight entry for chart/agent requests"""
    ticker: str = Field(..., min_length=1, max_length=20)
    weight: float = Field(..., gt=0, description="Portfolio weight (fraction 0-1 or percent)")

    @field_validator("ticker")
    @classmethod
    def normalise_ticker(cls, v: str) -> str:
        return v.upper().strip()


class ChartDataRequest(BaseModel):
    portfolio: List[PortfolioItem]
    exchange: str = Field("NS", pattern="^(NS|BO)$")
    period: str = Field("1y", pattern="^(1d|5d|1mo|3mo|6mo|1y|2y|5y|10y|ytd|max)$")
    rolling_window: int = Field(21, ge=5, le=63)


class CumulativeReturnsData(BaseModel):
    dates: List[str]
    portfolio: List[float]
    per_ticker: Dict[str, List[float]]


class RollingVolatilityData(BaseModel):
    dates: List[str]
    portfolio: List[float]


class SectorAllocationData(BaseModel):
    labels: List[str]
    values: List[float]


class ChartDataResponse(BaseModel):
    cumulative_returns: CumulativeReturnsData
    rolling_volatility: RollingVolatilityData
    sector_allocation: SectorAllocationData
    errors: List[str] = Field(default_factory=list)


class AgentChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str


class AgentChatRequest(BaseModel):
    portfolio: List[PortfolioItem]
    message: str = Field(..., min_length=1, max_length=2000)
    chat_history: List[AgentChatMessage] = Field(default_factory=list)
    exchange: str = Field("NS", pattern="^(NS|BO)$")
    period: str = Field("1y", pattern="^(1d|5d|1mo|3mo|6mo|1y|2y|5y|10y|ytd|max)$")


class AgentChatResponse(BaseModel):
    message: str
    chart_type: str = Field(..., pattern="^(performance|risk|comparison|whatif|none)$")
    chart_data: Optional[Dict[str, Any]] = None
    suggestions: List[str] = Field(
        default_factory=list,
        description="3 contextual follow-up questions for the chat UI.",
    )


# ── Chat-session persistence schemas ──────────────────────────────────────────

class ChatTurn(BaseModel):
    """Single message turn stored inside a chat_sessions document."""

    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=5000)
    timestamp: datetime
    chart_type: Optional[str] = Field(
        None, description="Chart type emitted by the assistant (assistant turns only)"
    )
    suggestions: List[str] = Field(default_factory=list)


class PortfolioSnapshotItem(BaseModel):
    """Lightweight holding record stored as a portfolio snapshot in a session."""

    ticker: str = Field(..., min_length=1, max_length=20)
    weight: float = Field(..., gt=0, le=1, description="Normalised weight (0 < w ≤ 1)")

    @field_validator("ticker")
    @classmethod
    def uppercase_ticker(cls, v: str) -> str:
        return v.upper().strip()


class ChatSessionMeta(BaseModel):
    """
    Metadata-only summary of a past chat session.
    The full messages array is intentionally excluded to keep responses lightweight.
    """

    session_id: str = Field(..., description="Unique chat session identifier (UUID4)")
    portfolio_tickers: List[str] = Field(
        default_factory=list,
        description="Tickers present in the portfolio snapshot at the time of the last turn",
    )
    message_count: int = Field(
        default=0, ge=0, description="Total number of stored message turns (user + assistant)"
    )
    last_message_preview: Optional[str] = Field(
        None,
        max_length=200,
        description="Truncated preview of the last user message for display in the history list",
    )
    created_at: datetime = Field(..., description="When the chat session was first created (UTC)")
    updated_at: datetime = Field(..., description="When the chat session was last updated (UTC)")


class ChatSessionHistoryResponse(BaseModel):
    """Response for GET /v1/portfolio/history — the caller's chat session list."""

    sessions: List[ChatSessionMeta] = Field(
        default_factory=list,
        description="Ordered list of sessions, newest first",
    )
    total: int = Field(..., ge=0, description="Total number of sessions returned")


class DeleteSessionResponse(BaseModel):
    """Confirmation payload returned after deleting a chat session."""

    deleted: bool
    session_id: str
    message: str


class FullChatSessionResponse(BaseModel):
    """
    Full chat session document returned by GET /v1/portfolio/history/{session_id}.
    Includes all stored message turns and the last known portfolio snapshot.
    """

    session_id: str = Field(..., description="Unique chat session identifier (UUID4)")
    messages: List[ChatTurn] = Field(
        default_factory=list,
        description="All stored message turns, oldest first",
    )
    portfolio_snapshot: List[PortfolioSnapshotItem] = Field(
        default_factory=list,
        description="Portfolio holdings at the time of the last message turn",
    )
    portfolio_tickers: List[str] = Field(default_factory=list)
    message_count: int = Field(default=0, ge=0)
    created_at: datetime
    updated_at: datetime
