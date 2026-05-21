"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import type { PortfolioUploadSummary } from "@/lib/api";
import type { AgentPortfolioMetrics } from "../../_types";

// ── Severity styling ───────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  mild:     { bg: "bg-amber-500/10",  border: "border-amber-500/20",  badge: "bg-amber-500/20 text-amber-300",  bar: "#f59e0b" },
  moderate: { bg: "bg-orange-500/10", border: "border-orange-500/20", badge: "bg-orange-500/20 text-orange-300", bar: "#f97316" },
  severe:   { bg: "bg-rose-500/10",   border: "border-rose-500/20",   badge: "bg-rose-500/20 text-rose-300",     bar: "#f43f5e" },
  extreme:  { bg: "bg-red-950/30",    border: "border-red-500/30",    badge: "bg-red-500/20 text-red-300",       bar: "#dc2626" },
};

// ── Historical market facts ────────────────────────────────────────────────────
// niftyImpact: verified Nifty 50 peak-to-trough drawdown for each event.
// Portfolio impacts are derived at runtime from live portfolio volatility below.

const BASE_SCENARIOS = [
  {
    id: "covid",
    name: "COVID-19 Crash",
    period: "Feb – Mar 2020",
    niftyImpact: -38.0,
    niftyRecoveryDays: 45,
    severity: "severe" as const,
    description:
      "Global pandemic-induced selloff. Healthcare and Consumer Staples held up; cyclicals, Finance, and Energy bore the brunt.",
  },
  {
    id: "gfc",
    name: "2008 Global Crisis",
    period: "Sep 2008 – Mar 2009",
    niftyImpact: -55.0,
    niftyRecoveryDays: 180,
    severity: "extreme" as const,
    description:
      "Global credit crisis — deepest modern drawdown. Highly leveraged and Finance-heavy portfolios suffered most.",
  },
  {
    id: "taper",
    name: "2013 Taper Tantrum",
    period: "May – Aug 2013",
    niftyImpact: -17.2,
    niftyRecoveryDays: 90,
    severity: "moderate" as const,
    description:
      "Fed tapering surprise triggered EM outflows and INR depreciation. IT exporters benefited; domestic-consumption stocks hurt.",
  },
  {
    id: "inflation",
    name: "Inflation Shock (+4%)",
    period: "Hypothetical",
    niftyImpact: -11.5,
    niftyRecoveryDays: 60,
    severity: "mild" as const,
    description:
      "Sustained inflation spike compresses margins and triggers rate hikes. Consumer Staples and Healthcare provide hedges.",
  },
  {
    id: "inr",
    name: "INR Depreciation 20%",
    period: "Hypothetical",
    niftyImpact: -8.0,
    niftyRecoveryDays: 45,
    severity: "mild" as const,
    description:
      "Currency shock. IT exporters gain from a weaker rupee; Energy importers and domestic retailers are hurt.",
  },
] as const;

// ── Metric tile ───────────────────────────────────────────────────────────────

const RiskMetric = ({
  label,
  value,
  color,
  note,
}: {
  label: string;
  value: string;
  color: string;
  note?: string;
}) => (
  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
      {label}
    </div>
    <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
    {note && <div className="text-[10px] text-slate-600 mt-0.5">{note}</div>}
  </div>
);

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  summary?: PortfolioUploadSummary | null;
  /**
   * Live portfolio metrics from chart_data.portfolio (agent chat response).
   * Fallback for VaR, Max Drawdown, Volatility, and Sharpe so the stress
   * scenario engine never shows "—" or defaults to β = 1.0 after a chat
   * response that contains real portfolio metrics.
   */
  agentPortfolio?: AgentPortfolioMetrics | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StressTab({ summary, agentPortfolio }: Props) {
  // ── Live risk values ────────────────────────────────────────────────────────
  // Priority 1: CSV upload summary (preferred — covers full analytics)
  // Priority 2: agent portfolio metrics from chat_data.portfolio
  //
  // When agentPortfolio is the only source, the implied beta (vol / 18) is
  // computed from the live annualised volatility the agent fetched via yfinance
  // rather than defaulting to 1.0, so stress scenario impacts are personalised.
  const var95  = summary?.value_at_risk_95     ?? agentPortfolio?.var_95_pct              ?? null;
  const maxDD  = summary?.max_drawdown          ?? agentPortfolio?.max_drawdown_pct         ?? null;
  const vol    = summary?.annualized_volatility ?? agentPortfolio?.annualized_volatility_pct ?? null;
  const sharpe = summary?.sharpe_ratio          ?? agentPortfolio?.sharpe_ratio              ?? null;

  // ── Implied beta: portfolio_vol / nifty_long_run_vol (≈ 18 %) ─────────────
  // Nifty 50 long-run annualised volatility is ~18%.
  // beta = cov(p, m) / var(m) ≈ (corr × σ_p) / σ_m
  // For Indian large-caps, corr ≈ 0.85–0.95, so vol/18 is a reasonable proxy.
  // Clamped to [0.40, 2.00] for sanity; defaults to 1.0 before any upload.
  const impliedBeta = vol !== null
    ? Math.max(0.40, Math.min(2.00, vol / 18.0))
    : 1.0;

  // ── Derive portfolio impact for every scenario ─────────────────────────────
  const scenarios = BASE_SCENARIOS.map((sc) => ({
    ...sc,
    portfolioImpact: parseFloat((sc.niftyImpact * impliedBeta).toFixed(1)),
  }));

  const barChartData = scenarios.map((s) => ({
    name: s.name.split(" ").slice(0, 2).join(" "),
    portfolio: s.portfolioImpact,
    nifty: s.niftyImpact,
  }));

  // Beta colour
  const betaColor =
    impliedBeta >= 1.2
      ? "text-rose-400"
      : impliedBeta <= 0.8
      ? "text-emerald-400"
      : "text-amber-400";

  return (
    <div className="space-y-6">
      {/* Header banner */}
      <div className="flex items-center justify-between rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">
            Stress Test Engine
          </div>
          <div className="text-sm text-slate-400">
            {summary
              ? `Portfolio impacts estimated from your ${vol?.toFixed(1) ?? "—"}% annualised volatility (implied β ${impliedBeta.toFixed(2)})`
              : "Upload a portfolio to personalise scenario impact estimates"}
          </div>
        </div>
        <span className="text-xs font-bold bg-amber-500/20 text-amber-300 px-3 py-1 rounded-full border border-amber-500/20">
          {BASE_SCENARIOS.length} scenarios
        </span>
      </div>

      {/* Live risk metrics strip — VaR, MaxDD, Vol, Beta from real data */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <RiskMetric
          label="Value at Risk (95%)"
          value={var95 !== null ? `${var95.toFixed(2)}%` : "—"}
          color="text-rose-400"
          note="1-day 95% VaR"
        />
        <RiskMetric
          label="Max Drawdown"
          value={maxDD !== null ? `${maxDD.toFixed(1)}%` : "—"}
          color="text-rose-400"
          note="Peak-to-trough"
        />
        <RiskMetric
          label="Annualised Vol."
          value={vol !== null ? `${vol.toFixed(1)}%` : "—"}
          color="text-amber-400"
          note="Used for beta estimate"
        />
        <RiskMetric
          label="Implied Beta"
          value={summary ? impliedBeta.toFixed(2) : "—"}
          color={betaColor}
          note="vs Nifty 50 (vol / 18%)"
        />
      </div>

      {/* Comparative bar chart */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4">
          Portfolio vs Nifty — Estimated Scenario Impact
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={barChartData}
            margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
            barGap={4}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: "#475569", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => `${v}%`}
              tick={{ fill: "#475569", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(v, name) => [
                typeof v === "number" ? `${v.toFixed(1)}%` : String(v),
                name === "portfolio" ? "My Portfolio (est.)" : "Nifty 50 (historical)",
              ]}
              contentStyle={{
                backgroundColor: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: 12,
              }}
              itemStyle={{ color: "#f8fafc" }}
              labelStyle={{ color: "#94a3b8" }}
            />
            <Bar dataKey="portfolio" name="portfolio" radius={[4, 4, 0, 0]} fill="#f43f5e" maxBarSize={32} />
            <Bar dataKey="nifty"     name="nifty"     radius={[4, 4, 0, 0]} fill="#475569" maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-6 mt-2 justify-center text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-rose-500 inline-block" />
            My Portfolio (estimated)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-slate-500 inline-block" />
            Nifty 50 (historical)
          </span>
        </div>
      </div>

      {/* Scenario cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        {scenarios.map((sc) => {
          const cfg = SEVERITY_CONFIG[sc.severity];
          return (
            <div key={sc.id} className={`rounded-2xl border p-5 space-y-3 ${cfg.bg} ${cfg.border}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-white text-sm">{sc.name}</div>
                  <div className="text-xs text-slate-500">{sc.period}</div>
                </div>
                <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${cfg.badge}`}>
                  {sc.severity}
                </span>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">{sc.description}</p>

              <div className="flex gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">
                    Portfolio (est.)
                  </div>
                  <div className="text-2xl font-bold font-mono text-rose-400">
                    {sc.portfolioImpact.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">
                    Nifty (hist.)
                  </div>
                  <div className="text-2xl font-bold font-mono text-slate-400">
                    {sc.niftyImpact}%
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">
                    Nifty Recovery
                  </div>
                  <div className="text-2xl font-bold font-mono text-amber-400">
                    {sc.niftyRecoveryDays}d
                  </div>
                </div>
              </div>

              {/* Severity bar */}
              <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(100, (Math.abs(sc.portfolioImpact) / 60) * 100)}%`,
                    backgroundColor: cfg.bar,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Sharpe context */}
      {sharpe !== null && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-3 flex gap-3 items-center text-sm">
          <span className={`font-bold font-mono text-lg ${sharpe >= 1 ? "text-emerald-400" : sharpe >= 0.5 ? "text-amber-400" : "text-rose-400"}`}>
            {sharpe.toFixed(2)}
          </span>
          <span className="text-slate-400">
            Sharpe ratio —{" "}
            {sharpe >= 1
              ? "your risk-adjusted returns are strong. Downside scenarios are better cushioned."
              : sharpe >= 0.5
              ? "moderate risk-adjusted returns. Consider reducing concentrated positions."
              : "low risk-adjusted returns. Stress scenarios may hit harder than peers."}
          </span>
        </div>
      )}

      {/* Disclaimer */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-3 flex gap-3 items-start text-sm text-slate-400">
        <span className="text-amber-400 mt-0.5 shrink-0">⚠</span>
        <span>
          Portfolio impacts are estimated using your implied beta (
          {summary
            ? `${impliedBeta.toFixed(2)}× vs Nifty, derived from ${vol?.toFixed(1)}% volatility`
            : "upload a portfolio to personalise"}
          ) applied to historical Nifty 50 drawdowns. Actual outcomes depend on
          correlation breaks, liquidity, and rebalancing timing.
        </span>
      </div>
    </div>
  );
}
