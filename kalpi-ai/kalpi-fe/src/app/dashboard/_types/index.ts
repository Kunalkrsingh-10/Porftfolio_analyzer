export type TabId =
  | "performance"
  | "risk"
  | "diversification"
  | "benchmark"
  | "stress"
  | "health";

export interface TabConfig {
  id: TabId;
  label: string;
  accentClass: string;       // text color
  glowClass: string;         // bg/glow color
  borderClass: string;
  activeBgClass: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  triggeredTab?: TabId;
}

// ── Portfolio input ────────────────────────────────────────────────────────────

export interface PortfolioItem {
  ticker: string;
  weight: number; // fraction 0-1
}

// ── Chart data shapes (mirrors backend ChartDataResponse) ─────────────────────

export interface CumulativeReturnsData {
  dates: string[];
  portfolio: number[];
  per_ticker: Record<string, number[]>;
}

export interface RollingVolatilityData {
  dates: string[];
  portfolio: number[];
}

export interface SectorAllocationData {
  labels: string[];
  values: number[];
}

export interface TickerStats {
  total_return_pct: number;
  cagr_pct: number;
  bars: number;
}

export interface PortfolioChartData {
  cumulative_returns: CumulativeReturnsData;
  rolling_volatility: RollingVolatilityData;
  sector_allocation: SectorAllocationData;
  /** Per-ticker stats returned by /v1/portfolio/charts (total_return_pct, cagr_pct, bars). */
  ticker_stats?: Record<string, TickerStats>;
  errors: string[];
}

// ── Agent chat ─────────────────────────────────────────────────────────────────

export type ChartType = "performance" | "risk" | "comparison" | "whatif" | "none";

export interface AgentChatResponse {
  message: string;
  chart_type: ChartType;
  chart_data: Record<string, unknown> | null;
  suggestions: string[];
}

// ── Agent portfolio metrics (chart_data.portfolio from any chat response) ─────
//
// Returned by the backend inside:
//   chatPortfolio()  → response.canvas_data.portfolio
//   agentChat()      → response.chart_data.portfolio
//
// Field names match the backend AgentResponse chart_data shape exactly so
// the ?? fallback bindings in each tab component are type-safe.

export interface AgentPortfolioMetrics {
  tickers_used?: string[];
  weights_used?: number[];
  period?: string;
  /** Annualised CAGR, e.g. 15.23 = 15.23 % */
  cagr_pct?: number | null;
  /** Total return over the period, e.g. 18.45 = 18.45 % */
  total_return_pct?: number | null;
  /** Annualised volatility, e.g. 22.1 = 22.1 % */
  annualized_volatility_pct?: number | null;
  /** 1-day 95% VaR as a percentage, e.g. -1.85 = -1.85 % */
  var_95_pct?: number | null;
  /** Peak-to-trough drawdown, e.g. -12.3 = -12.3 % */
  max_drawdown_pct?: number | null;
  /** Sharpe ratio, dimensionless */
  sharpe_ratio?: number | null;
  /** Latest closing price (single-stock fast-path only) */
  latest_close?: number | null;
  /** Present when yfinance fetch failed for this ticker */
  error?: string;
}

// ── What-If simulation data shape ─────────────────────────────────────────────

export interface WhatIfMetrics {
  cagr_pct: number;
  total_return_pct: number;
  annualized_volatility_pct: number;
  var_95_pct: number;
  max_drawdown_pct: number;
  sharpe_ratio: number;
  tickers?: string[];
}

export interface WhatIfDelta {
  cagr_pct: number;
  sharpe_ratio: number;
  max_drawdown_pct: number;
  annualized_volatility_pct: number;
  var_95_pct: number;
}

export interface WhatIfTrade {
  sell_ticker: string;
  sell_weight: number;
  buy_ticker: string;
  buy_weight: number;
}

export interface WhatIfData {
  before: WhatIfMetrics;
  after: WhatIfMetrics;
  delta: WhatIfDelta;
  trade: WhatIfTrade;
  common_days?: number;
}
