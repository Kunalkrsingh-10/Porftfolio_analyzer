/* eslint-disable */

/**
 * API client — points directly at FastAPI (http://localhost:8000).
 * Nginx and authentication have been removed; no Bearer/Authorization
 * headers are attached to any request.
 */

import { env } from "@/env";

// FastAPI runs directly on port 8000 — no Nginx prefix, no /api segment.
const API_BASE_URL = (
  env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

const PORTFOLIO_API_ROOT = `${API_BASE_URL}/v1/portfolio`;

// ── Shared error helper ───────────────────────────────────────────────────────

async function parseApiError(response: Response): Promise<string> {
  const payload = await response.text();
  try {
    const parsed = JSON.parse(payload) as { detail?: string };
    return parsed.detail ?? payload ?? response.statusText;
  } catch {
    return payload || response.statusText;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type TopPerformer = {
  ticker: string;
  return_pct: number;
  pnl: number;
  sector: string;
};

export type HoldingBreakdown = {
  ticker: string;
  sector: string;
  quantity: number;
  purchase_price: number;
  current_price: number;
  purchase_value: number;
  current_value: number;
  pnl: number;
  return_pct: number;
  weight_pct: number;
};

export type RiskScore = {
  score: number;
  label: string;
  color: string;
};

export type ConcentrationRisk = {
  hhi: number;
  level: string;
  top_positions: Array<{ ticker: string; allocation_pct: number }>;
};

export type WinRate = {
  win_rate: number;
  winners: number;
  losers: number;
  flat: number;
  total: number;
};

export type PortfolioAge = {
  oldest_holding_days: number;
  newest_holding_days: number;
  avg_holding_days: number;
};

export type PortfolioUploadSummary = {
  session_id: string;
  total_return_cumulative: number;
  annualized_return: number;
  sharpe_ratio: number;
  max_drawdown: number;
  value_at_risk_95: number;
  annualized_volatility: number;
  portfolio_value: number;
  total_cost_basis: number;
  total_pnl: number;
  total_holdings: number;
  sector_allocation: Record<string, number>;
  concentration_risk: ConcentrationRisk;
  win_rate: WinRate;
  risk_score: RiskScore;
  portfolio_age: PortfolioAge;
  top_gainers: TopPerformer[];
  top_losers: TopPerformer[];
  holdings_breakdown: HoldingBreakdown[];
};

export type PortfolioHistoryItem = {
  session_id: string;
  file_name: string;
  uploaded_at: string;
  total_return_cumulative: number;
  portfolio_value: number;
  total_holdings: number;
};

export type PortfolioHistoryResponse = {
  history: PortfolioHistoryItem[];
};

export type PortfolioChatResponse = {
  bot_response: string;
  active_canvas_view:
    | "risk"
    | "returns"
    | "diversification"
    | "holdings"
    | "performance"
    | "none";
  canvas_data?: unknown;
};

export type PortfolioItemReq = { ticker: string; weight: number };

export type ChartDataResponse = {
  cumulative_returns: {
    dates: string[];
    portfolio: number[];
    per_ticker: Record<string, number[]>;
  };
  rolling_volatility: { dates: string[]; portfolio: number[] };
  sector_allocation: { labels: string[]; values: number[] };
  errors: string[];
};

export type AgentChatApiResponse = {
  message: string;
  chart_type: "performance" | "risk" | "comparison" | "whatif" | "none";
  chart_data: Record<string, unknown> | null;
  suggestions: string[];
};

export type ChatSessionMeta = {
  session_id: string;
  portfolio_tickers: string[];
  message_count: number;
  last_message_preview: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatSessionHistoryResponse = {
  sessions: ChatSessionMeta[];
  total: number;
};

export type StoredChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  chart_type?: string | null;
  suggestions?: string[];
};

export type FullChatSession = {
  session_id: string;
  messages: StoredChatMessage[];
  portfolio_snapshot: Array<{ ticker: string; weight: number }>;
  portfolio_tickers: string[];
  message_count: number;
  created_at: string;
  updated_at: string;
};

export type PersistentChatResponse = {
  bot_response: string;
  active_canvas_view:
    | "risk"
    | "returns"
    | "diversification"
    | "holdings"
    | "performance"
    | "none";
  canvas_data: Record<string, unknown> | null;
  suggestions: string[];
  chat_session_id: string;
};

// ── Portfolio endpoints ───────────────────────────────────────────────────────

/** Upload a portfolio CSV. Returns full metrics + a session_id. */
export async function uploadPortfolioCsv(
  file: File,
): Promise<PortfolioUploadSummary> {
  const formData = new FormData();
  formData.append("file", file, file.name);

  const response = await fetch(`${PORTFOLIO_API_ROOT}/upload`, {
    method: "POST",
    body: formData,
    // No Authorization header — auth has been removed.
    // Do NOT set Content-Type here; browser sets it automatically with the
    // correct multipart boundary for FormData.
  });

  if (!response.ok) throw new Error(await parseApiError(response));
  return response.json() as Promise<PortfolioUploadSummary>;
}

/** Fetch portfolio analysis by session ID. */
export async function getPortfolio(
  sessionId: string,
): Promise<PortfolioUploadSummary> {
  const response = await fetch(
    `${PORTFOLIO_API_ROOT}/get?session_id=${encodeURIComponent(sessionId)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) throw new Error(await parseApiError(response));
  return response.json() as Promise<PortfolioUploadSummary>;
}

/** List all uploaded portfolio sessions (metadata only). */
export async function getPortfolioHistory(): Promise<PortfolioHistoryResponse> {
  const response = await fetch(`${PORTFOLIO_API_ROOT}/history`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  return response.json() as Promise<PortfolioHistoryResponse>;
}

// ── Chart + agent endpoints ───────────────────────────────────────────────────

/** Fetch cumulative-return, rolling-volatility, and sector-allocation chart data. */
export async function fetchChartData(
  portfolio: PortfolioItemReq[],
  exchange: "NS" | "BO" = "NS",
  period = "1y",
  rollingWindow = 21,
): Promise<ChartDataResponse> {
  const response = await fetch(`${PORTFOLIO_API_ROOT}/charts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      portfolio,
      exchange,
      period,
      rolling_window: rollingWindow,
    }),
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  return response.json() as Promise<ChartDataResponse>;
}

/** Send a one-off message to the LangGraph agent (no session persistence). */
export async function agentChat(
  portfolio: PortfolioItemReq[],
  message: string,
  chatHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
  exchange: "NS" | "BO" = "NS",
  period = "1y",
): Promise<AgentChatApiResponse> {
  const response = await fetch(`${PORTFOLIO_API_ROOT}/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      portfolio,
      message,
      chat_history: chatHistory,
      exchange,
      period,
    }),
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  return response.json() as Promise<AgentChatApiResponse>;
}

// ── Persistent chat endpoints ─────────────────────────────────────────────────

/** Send a message with full session persistence (chat_session_id continuity). */
export async function chatWithHistory(req: {
  user_message: string;
  portfolio?: Array<{ ticker: string; weight: number }>;
  chat_session_id?: string;
  session_id?: string;
  exchange?: string;
  period?: string;
}): Promise<PersistentChatResponse> {
  const response = await fetch(`${PORTFOLIO_API_ROOT}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(req),
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  return response.json() as Promise<PersistentChatResponse>;
}

/**
 * Legacy chat helper used by portfolio/page.tsx.
 * Calls /v1/portfolio/chat with session_id + user_message.
 */
export async function chatPortfolio(
  sessionId: string | null | undefined,
  userMessage: string,
): Promise<PortfolioChatResponse> {
  const body: Record<string, string> = { user_message: userMessage };
  if (sessionId) body.session_id = sessionId;

  const response = await fetch(`${PORTFOLIO_API_ROOT}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  return response.json() as Promise<PortfolioChatResponse>;
}

// ── Chat history / session management ────────────────────────────────────────

/** List all chat sessions (metadata only, newest first). */
export async function getChatHistory(): Promise<ChatSessionHistoryResponse> {
  const response = await fetch(`${PORTFOLIO_API_ROOT}/history`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  return response.json() as Promise<ChatSessionHistoryResponse>;
}

/** Fetch a single chat session with its full message history. */
export async function getChatSession(
  sessionId: string,
): Promise<FullChatSession> {
  const response = await fetch(
    `${PORTFOLIO_API_ROOT}/history/${encodeURIComponent(sessionId)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) throw new Error(await parseApiError(response));
  return response.json() as Promise<FullChatSession>;
}

/** Permanently delete a chat session. */
export async function deleteChatSession(sessionId: string): Promise<void> {
  const response = await fetch(
    `${PORTFOLIO_API_ROOT}/history/${encodeURIComponent(sessionId)}`,
    { method: "DELETE", headers: { Accept: "application/json" } },
  );
  if (!response.ok) throw new Error(await parseApiError(response));
}
