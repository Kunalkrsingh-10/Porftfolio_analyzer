"use client";

import type { PortfolioChartData, AgentPortfolioMetrics } from "../../_types";
import type { PortfolioUploadSummary } from "@/lib/api";
import RollingVolatilityChart from "../charts/RollingVolatilityChart";

// ── Metric tile ───────────────────────────────────────────────────────────────

const Metric = ({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) => (
  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
    <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1">
      {label}
    </div>
    <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
  </div>
);

// ── Quick-read item ───────────────────────────────────────────────────────────

const QuickRead = ({
  type,
  text,
}: {
  type: "positive" | "warning" | "negative";
  text: string;
}) => {
  const icon =
    type === "positive" ? "✓" : type === "warning" ? "⚠" : "✗";
  const color =
    type === "positive"
      ? "text-emerald-400"
      : type === "warning"
      ? "text-amber-400"
      : "text-rose-400";
  return (
    <li className="flex gap-2">
      <span className={`${color} mt-0.5 shrink-0`}>{icon}</span>
      <span>{text}</span>
    </li>
  );
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  chartData?: PortfolioChartData | null;
  summary?: PortfolioUploadSummary | null;
  /**
   * Live portfolio metrics from chart_data.portfolio (agent chat response).
   * Fallback for VaR, Max Drawdown, Volatility, and Sharpe when no CSV is
   * uploaded so risk metric tiles never display "—" after an AI response.
   */
  agentPortfolio?: AgentPortfolioMetrics | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RiskTab({ chartData, summary, agentPortfolio }: Props) {
  const hasRollingVol = (chartData?.rolling_volatility?.dates?.length ?? 0) > 0;

  // ── Live risk values ────────────────────────────────────────────────────────
  // Priority 1: CSV upload summary (includes risk_score, topLosers, etc.)
  // Priority 2: agent portfolio metrics from chart_data.portfolio
  // Field-name mapping:
  //   summary.value_at_risk_95        → agentPortfolio.var_95_pct
  //   summary.max_drawdown            → agentPortfolio.max_drawdown_pct
  //   summary.annualized_volatility   → agentPortfolio.annualized_volatility_pct
  //   summary.sharpe_ratio            → agentPortfolio.sharpe_ratio  (same key)
  const riskScore  = summary?.risk_score ?? null;
  const var95      = summary?.value_at_risk_95     ?? agentPortfolio?.var_95_pct              ?? null;
  const maxDD      = summary?.max_drawdown          ?? agentPortfolio?.max_drawdown_pct         ?? null;
  const vol        = summary?.annualized_volatility ?? agentPortfolio?.annualized_volatility_pct ?? null;
  const sharpe     = summary?.sharpe_ratio          ?? agentPortfolio?.sharpe_ratio              ?? null;
  const topLosers  = summary?.top_losers ?? [];

  const scoreColor = riskScore
    ? riskScore.score < 35
      ? "text-emerald-400"
      : riskScore.score < 65
      ? "text-amber-400"
      : "text-rose-400"
    : "text-amber-400";

  // ── Dynamic quick reads ─────────────────────────────────────────────────────
  const quickReads: { type: "positive" | "warning" | "negative"; text: string }[] =
    summary
      ? [
          // Sharpe quality
          sharpe !== null
            ? sharpe >= 1
              ? {
                  type: "positive" as const,
                  text: `Sharpe of ${sharpe.toFixed(2)} — above-market risk-adjusted returns`,
                }
              : sharpe >= 0.5
              ? {
                  type: "warning" as const,
                  text: `Sharpe of ${sharpe.toFixed(2)} — moderate risk-adjusted performance`,
                }
              : {
                  type: "negative" as const,
                  text: `Sharpe of ${sharpe.toFixed(2)} — below-market risk-adjusted returns`,
                }
            : null,
          // Max drawdown
          maxDD !== null
            ? Math.abs(maxDD) < 15
              ? {
                  type: "warning" as const,
                  text: `Max drawdown ${maxDD.toFixed(1)}% — manageable historical peak-to-trough decline`,
                }
              : {
                  type: "negative" as const,
                  text: `Max drawdown ${maxDD.toFixed(1)}% — significant drawdown risk in bear markets`,
                }
            : null,
          // Worst loser — return_pct is now split-adjusted so this reflects
          // true holding-period return, not a split artefact
          topLosers.length > 0
            ? {
                type: "negative" as const,
                text: `${topLosers[0]!.ticker} (${topLosers[0]!.return_pct.toFixed(1)}%) is the worst return since purchase`,
              }
            : null,
        ].filter(Boolean) as { type: "positive" | "warning" | "negative"; text: string }[]
      : [];

  return (
    <div className="space-y-6">
      {/* Risk Score Banner */}
      <div className="flex items-center justify-between rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1">
            Overall Risk Score
          </div>
          <div className="text-sm text-slate-400">Lower score = safer portfolio</div>
        </div>
        <div className="flex items-center gap-4">
          {riskScore ? (
            <>
              <span className={`text-6xl font-bold tracking-tight ${scoreColor}`}>
                {riskScore.score}
                <span className="text-lg text-slate-500 font-normal"> /100</span>
              </span>
              <span
                className="px-4 py-1.5 rounded-full text-sm font-bold border"
                style={{
                  color: riskScore.color,
                  borderColor: `${riskScore.color}40`,
                  backgroundColor: `${riskScore.color}15`,
                }}
              >
                {riskScore.label}
              </span>
            </>
          ) : (
            <span className="text-3xl font-bold text-slate-500">—</span>
          )}
        </div>
      </div>

      {/* Rolling volatility */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-2 text-center">
          {hasRollingVol
            ? "21-Day Rolling Volatility (Annualised %)"
            : "Rolling Volatility"}
        </h3>
        {hasRollingVol ? (
          <RollingVolatilityChart data={chartData!.rolling_volatility} height={260} />
        ) : (
          <div className="flex items-center justify-center h-[260px] text-slate-500 text-sm">
            {summary
              ? "Volatility chart data is loading — check docker logs if this persists."
              : "Upload a portfolio to see the rolling volatility chart."}
          </div>
        )}
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric
          label="Value at Risk (95%)"
          value={var95 !== null ? `${var95.toFixed(2)}%` : "—"}
          color="text-rose-400"
        />
        <Metric
          label="Max Drawdown"
          value={maxDD !== null ? `${maxDD.toFixed(1)}%` : "—"}
          color="text-rose-400"
        />
        <Metric
          label="Annualised Vol."
          value={vol !== null ? `${vol.toFixed(1)}%` : "—"}
          color="text-amber-400"
        />
        <Metric
          label="Sharpe Ratio"
          value={sharpe !== null ? sharpe.toFixed(2) : "—"}
          color="text-emerald-400"
        />
      </div>

      {/* Quick reads — dynamic from live data */}
      {quickReads.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
            Quick Reads
          </div>
          <ul className="space-y-1.5 text-sm text-slate-300">
            {quickReads.map((r, i) => (
              <QuickRead key={i} type={r.type} text={r.text} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
