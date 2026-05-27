"use client";

import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, Cell,
} from "recharts";
import type { PortfolioChartData, WhatIfData, AgentPortfolioMetrics } from "../../_types";
import type { PortfolioUploadSummary } from "@/lib/api";
import CumulativeReturnChart from "../charts/CumulativeReturnChart";
import WhatIfCard from "../charts/WhatIfCard";

// ── Formatters ─────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
const sign = (n: number) => (n >= 0 ? "text-emerald-400" : "text-rose-400");

/** Strip exchange suffix (.NS / .BO) for compact axis labels. */
const stripSuffix = (t: string) => t.replace(/\.(NS|BO)$/i, "");

// ── KPI card ──────────────────────────────────────────────────────────────────

const KPI = ({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col gap-1">
    <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
      {label}
    </span>
    <span className={`text-3xl font-bold tracking-tight ${color ?? "text-white"}`}>
      {value}
    </span>
    {sub && <span className="text-xs text-slate-500">{sub}</span>}
  </div>
);

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  chartData?: PortfolioChartData | null;
  whatIfData?: WhatIfData | null;
  summary?: PortfolioUploadSummary | null;
  /**
   * Live portfolio metrics returned by the agent in chart_data.portfolio.
   * Used as a fallback when no CSV has been uploaded (summary is null) so
   * the Total Return and CAGR cards never display "—" after a chat response.
   */
  agentPortfolio?: AgentPortfolioMetrics | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PerformanceTab({ chartData, whatIfData, summary, agentPortfolio }: Props) {
  const hasCumulative = (chartData?.cumulative_returns?.dates?.length ?? 0) > 0;

  // ── Per-ticker bar data ────────────────────────────────────────────────────
  // Priority 1: ticker_stats from /charts  (yfinance historical total return)
  // Priority 2: holdings_breakdown from /upload (purchase price vs current)
  // Priority 3: empty → empty-state placeholder
  const barData: { ticker: string; label: string; returnPct: number }[] = (() => {
    const ts = chartData?.ticker_stats;
    if (ts && Object.keys(ts).length > 0) {
      return Object.entries(ts)
        .map(([ticker, stats]) => ({
          ticker,
          label: stripSuffix(ticker),
          returnPct: parseFloat(stats.total_return_pct.toFixed(2)),
        }))
        .sort((a, b) => b.returnPct - a.returnPct);
    }
    if (summary?.holdings_breakdown?.length) {
      return [...summary.holdings_breakdown]
        .sort((a, b) => b.return_pct - a.return_pct)
        .map((h) => ({
          ticker: h.ticker,
          label: stripSuffix(h.ticker),
          returnPct: parseFloat(h.return_pct.toFixed(2)),
        }));
    }
    return [];
  })();

  // ── Dynamic bar chart width ────────────────────────────────────────────────
  // Each ticker gets 52 px of horizontal space. Floor at 600 so a lone ticker
  // doesn't stretch into a comically wide single bar.
  // A 20-ticker portfolio → 1040 px (scrollable). A 1-ticker → 600 px (normal).
  const barChartWidth = Math.max(600, barData.length * 52);

  // ── Live KPIs ──────────────────────────────────────────────────────────────
  // Priority 1: CSV upload summary (most complete data, includes P&L)
  // Priority 2: agent portfolio metrics from chart_data.portfolio (chat response)
  // Fallback:   null → card displays "—" (never blank on a real API response)
  const totalReturn  = summary?.total_return_cumulative   ?? agentPortfolio?.total_return_pct          ?? null;
  const cagr         = summary?.annualized_return          ?? agentPortfolio?.cagr_pct                  ?? null;
  const portfolioVal = summary?.portfolio_value ?? null;
  const costBasis    = summary?.total_cost_basis ?? null;
  const totalPnl     = summary?.total_pnl ?? null;
  const winRateVal   = summary?.win_rate?.win_rate ?? null;
  const winners      = summary?.win_rate?.winners ?? null;
  const losers       = summary?.win_rate?.losers ?? null;

  // ── Agent-only supplemental fields ────────────────────────────────────────
  // When no CSV was uploaded (portfolioVal is null), use latest_close for
  // single-stock queries — it's the current market price, not a portfolio value,
  // so we label and note it differently.
  const latestClose  = agentPortfolio?.latest_close ?? null;
  const tickerCount  = agentPortfolio?.tickers_used?.length ?? null;
  // true when the agent returned a single-stock fast-path response
  const isSingleStock = tickerCount === 1 && portfolioVal === null;

  return (
    <div className="space-y-6">
      {/* What-If comparison — rendered when agent returns a trade simulation */}
      {whatIfData && <WhatIfCard data={whatIfData} />}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI
          label="Total Return"
          value={totalReturn !== null ? pct(totalReturn) : "—"}
          color={totalReturn !== null ? sign(totalReturn) : "text-slate-400"}
          sub={totalPnl !== null ? `P&L: ${fmt(totalPnl)}` : undefined}
        />
        <KPI
          label="CAGR"
          value={cagr !== null ? pct(cagr) : "—"}
          color={cagr !== null ? sign(cagr) : "text-slate-400"}
          sub="Annualised"
        />
        <KPI
          label={isSingleStock ? "Latest Price" : "Portfolio Value"}
          value={
            portfolioVal !== null
              ? fmt(portfolioVal)
              : isSingleStock && latestClose !== null
              ? fmt(latestClose)
              : tickerCount !== null && tickerCount > 1
              ? `${tickerCount} stocks`
              : "—"
          }
          sub={
            costBasis !== null
              ? `Cost: ${fmt(costBasis)}`
              : isSingleStock && latestClose !== null
              ? "Current market price"
              : tickerCount !== null && tickerCount > 1
              ? "Upload CSV for portfolio value"
              : undefined
          }
        />
        <KPI
          label="Win Rate"
          value={winRateVal !== null ? `${winRateVal.toFixed(1)}%` : "—"}
          color={winRateVal !== null ? "text-amber-400" : "text-slate-400"}
          sub={
            winners !== null && losers !== null
              ? `${winners}W / ${losers}L`
              : winRateVal === null && totalReturn !== null
              ? "Upload CSV for win rate"
              : undefined
          }
        />
      </div>

      {/* Cumulative return chart — Plotly handles any date-range width */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4">
          {hasCumulative
            ? "Cumulative Return (Indexed, Base = 100)"
            : "Cumulative Return"}
        </h3>
        {hasCumulative ? (
          <CumulativeReturnChart data={chartData!.cumulative_returns} height={220} />
        ) : (
          <div className="flex items-center justify-center h-[220px] text-slate-500 text-sm">
            {summary
              ? "Chart data is loading — check docker logs if this persists."
              : "Upload a portfolio to see the cumulative return chart."}
          </div>
        )}
      </div>

      {/* Per-ticker returns bar chart — horizontally scrollable for large portfolios */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">
            Per-Stock Returns
          </h3>
          {barData.length > 10 && (
            <span className="text-[10px] text-slate-500 font-medium">
              ← scroll →
            </span>
          )}
        </div>

        {barData.length > 0 ? (
          /*
           * Scroll wrapper: overflow-x-auto lets the chart extend beyond the
           * card boundary for large portfolios while keeping it fully visible
           * on small screens. The inner div is sized to barChartWidth so
           * Recharts gets a concrete pixel dimension (avoids the "0 width"
           * problem that ResponsiveContainer has inside overflow containers).
           */
          <div
            className="overflow-x-auto pb-1"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#334155 transparent" }}
          >
            <BarChart
              width={barChartWidth}
              height={200}
              data={barData}
              margin={{ top: 5, right: 16, bottom: 5, left: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#1e293b"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                interval={0}           /* show every label — never skip */
                tick={{ fill: "#475569", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `${v}%`}
                tick={{ fill: "#475569", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <ReferenceLine y={0} stroke="#334155" />
              <Tooltip
                formatter={(v) => [
                  typeof v === "number" ? `${v.toFixed(2)}%` : String(v),
                  "Return",
                ]}
                labelFormatter={(label) => String(label)}
                contentStyle={{
                  backgroundColor: "#0f172a",
                  border: "1px solid #1e293b",
                  borderRadius: 12,
                }}
                itemStyle={{ color: "#f8fafc" }}
                labelStyle={{ color: "#94a3b8" }}
              />
              <Bar dataKey="returnPct" radius={[4, 4, 0, 0]} maxBarSize={48}>
                {barData.map((entry) => (
                  <Cell
                    key={entry.ticker}
                    fill={entry.returnPct >= 0 ? "#10b981" : "#f43f5e"}
                  />
                ))}
              </Bar>
            </BarChart>
          </div>
        ) : (
          <div className="flex items-center justify-center h-[200px] text-slate-500 text-sm">
            {summary
              ? "Per-ticker data not yet available."
              : "Upload a portfolio to see per-stock returns."}
          </div>
        )}
      </div>
    </div>
  );
}
