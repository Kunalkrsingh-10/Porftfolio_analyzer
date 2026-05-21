"use client";

import type { PortfolioUploadSummary } from "@/lib/api";

// ── Recommendation priority styling ──────────────────────────────────────────

const PRIORITY_CONFIG = {
  high:   { badge: "bg-rose-500/15 text-rose-300 border-rose-500/20",   dot: "bg-rose-400" },
  medium: { badge: "bg-amber-500/15 text-amber-300 border-amber-500/20", dot: "bg-amber-400" },
  low:    { badge: "bg-sky-500/15 text-sky-300 border-sky-500/20",       dot: "bg-sky-400" },
};

// ── Sub-score derivations ─────────────────────────────────────────────────────

/**
 * Returns Quality (0-100) — Sharpe ratio × total return sign.
 * Sharpe ≥ 1.5 → 90+, ≥ 1.0 → 75, ≥ 0.5 → 55, else 30.
 * Bonus 10 pts for positive cumulative return.
 */
function returnsQualityScore(sharpe: number | null, totalReturn: number | null): number {
  if (sharpe === null) return 0;
  let base = sharpe >= 1.5 ? 90 : sharpe >= 1.0 ? 75 : sharpe >= 0.5 ? 55 : 30;
  if (totalReturn !== null && totalReturn > 0) base = Math.min(100, base + 10);
  return Math.round(base);
}

/**
 * Risk Management (0-100) — inverted risk_score.
 * Also penalised for low Sharpe and extreme max drawdown.
 */
function riskMgmtScore(
  riskScore: number | null,
  sharpe: number | null,
  maxDD: number | null,
): number {
  if (riskScore === null) return 0;
  let base = 100 - riskScore; // risk_score 0–100 (higher = riskier)
  if (sharpe !== null && sharpe < 0.5) base = Math.max(0, base - 10);
  if (maxDD !== null && maxDD < -30) base = Math.max(0, base - 10);
  return Math.round(Math.max(0, Math.min(100, base)));
}

/**
 * Diversification (0-100) — based on HHI.
 * HHI 0 = perfectly diversified (100), HHI 0.5 = concentrated (0).
 * Capped so score never exceeds 95.
 */
function diversificationScore(hhi: number | null): number {
  if (hhi === null) return 0;
  return Math.round(Math.min(95, Math.max(0, (1 - hhi / 0.5) * 100)));
}

/**
 * Liquidity (0-100) — proxy from number of holdings.
 * More holdings in liquid large-caps implies easier exit.
 * 20+ → 90, 15+ → 80, 10+ → 68, 5+ → 52, else 35.
 */
function liquidityScore(holdings: number): number {
  if (holdings >= 20) return 90;
  if (holdings >= 15) return 80;
  if (holdings >= 10) return 68;
  if (holdings >= 5) return 52;
  return 35;
}

/**
 * Momentum (0-100) — win rate + positive return bias.
 * win_rate 80%+ → 85, 60%+ → 70, 40%+ → 52, else 35.
 * Bonus 10 pts for positive cumulative return.
 */
function momentumScore(winRate: number | null, totalReturn: number | null): number {
  if (winRate === null) return 0;
  let base = winRate >= 80 ? 85 : winRate >= 60 ? 70 : winRate >= 40 ? 52 : 35;
  if (totalReturn !== null && totalReturn > 0) base = Math.min(100, base + 10);
  return Math.round(base);
}

// ── Recommendation generator ──────────────────────────────────────────────────

type Priority = "high" | "medium" | "low";
interface Rec { priority: Priority; text: string }

function buildRecommendations(summary: PortfolioUploadSummary): Rec[] {
  const recs: Rec[] = [];

  // Concentration risk
  if (summary.concentration_risk?.level === "Highly Concentrated") {
    recs.push({
      priority: "high",
      text: `HHI of ${summary.concentration_risk.hhi.toFixed(4)} signals high concentration. Redistribute some weight across more tickers.`,
    });
  }

  // Sharpe ratio
  if (summary.sharpe_ratio < 0.5) {
    recs.push({
      priority: "high",
      text: `Sharpe ratio of ${summary.sharpe_ratio.toFixed(2)} is below 0.5. Review underperforming positions — risk taken is not adequately compensated.`,
    });
  } else if (summary.sharpe_ratio < 1.0) {
    recs.push({
      priority: "medium",
      text: `Sharpe of ${summary.sharpe_ratio.toFixed(2)} is moderate. Trimming high-volatility losers could improve risk-adjusted returns.`,
    });
  }

  // Max drawdown
  if (summary.max_drawdown !== null && summary.max_drawdown < -25) {
    recs.push({
      priority: "medium",
      text: `Max drawdown of ${summary.max_drawdown.toFixed(1)}% is significant. Consider adding defensive or lower-correlation assets.`,
    });
  }

  // Losers
  const worstLoser = summary.top_losers?.[0];
  if (worstLoser && worstLoser.return_pct < -15) {
    recs.push({
      priority: "medium",
      text: `${worstLoser.ticker} is down ${worstLoser.return_pct.toFixed(1)}%. Review whether the investment thesis still holds.`,
    });
  }

  // Small portfolio
  if (summary.total_holdings < 6) {
    recs.push({
      priority: "medium",
      text: `Only ${summary.total_holdings} holdings. A minimum of 10–15 positions is recommended for adequate diversification.`,
    });
  }

  // Win rate
  if ((summary.win_rate?.win_rate ?? 100) < 40) {
    recs.push({
      priority: "high",
      text: `Win rate of ${summary.win_rate.win_rate.toFixed(1)}% means the majority of positions are in loss. Review entry points and sizing.`,
    });
  }

  // Sector concentration from sector_allocation
  if (summary.sector_allocation) {
    const heaviest = Object.entries(summary.sector_allocation)
      .sort((a, b) => b[1] - a[1])[0];
    if (heaviest && heaviest[1] > 35) {
      recs.push({
        priority: "low",
        text: `${heaviest[0]} represents ${heaviest[1].toFixed(1)}% of the portfolio. Consider reducing sector exposure below 30%.`,
      });
    }
  }

  // Gold/alternative hedge suggestion for volatile portfolios
  if (summary.annualized_volatility !== null && summary.annualized_volatility > 22) {
    recs.push({
      priority: "low",
      text: `Annualised volatility of ${summary.annualized_volatility.toFixed(1)}% is elevated. A small Gold ETF allocation (5–8%) can reduce portfolio swings.`,
    });
  }

  // Cap at 4 recommendations
  return recs.slice(0, 4);
}

// ── Circular gauge ────────────────────────────────────────────────────────────

function CircleGauge({ score }: { score: number }) {
  const r = 80;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : "#f43f5e";
  const label = score >= 80 ? "Excellent" : score >= 70 ? "Good" : score >= 50 ? "Fair" : "Poor";

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 200 200" className="w-44 h-44 -rotate-90">
        <circle cx="100" cy="100" r={r} fill="none" stroke="#1e293b" strokeWidth="14" />
        <circle
          cx="100" cy="100" r={r} fill="none"
          stroke={color} strokeWidth="14"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
        <g transform="rotate(90 100 100)">
          <text x="100" y="92" textAnchor="middle" fill="white" fontSize="38" fontWeight="700">
            {score}
          </text>
          <text x="100" y="114" textAnchor="middle" fill="#64748b" fontSize="13">
            / 100
          </text>
        </g>
      </svg>
      <span className="text-sm font-bold" style={{ color }}>{label}</span>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  summary?: PortfolioUploadSummary | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HealthTab({ summary }: Props) {
  if (!summary) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-slate-500">
        <svg className="w-12 h-12 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p className="text-sm">Upload a portfolio to generate your health score.</p>
      </div>
    );
  }

  // ── Compute all sub-scores from live data ──────────────────────────────────
  const sharpe      = summary.sharpe_ratio;
  const totalReturn = summary.total_return_cumulative;
  const maxDD       = summary.max_drawdown;
  const hhi         = summary.concentration_risk?.hhi ?? null;
  const winRate     = summary.win_rate?.win_rate ?? null;
  const riskScoreRaw = summary.risk_score?.score ?? null;

  const subsystems = [
    {
      name: "Returns Quality",
      score: returnsQualityScore(sharpe, totalReturn),
      color: "#10b981",
    },
    {
      name: "Risk Management",
      score: riskMgmtScore(riskScoreRaw, sharpe, maxDD),
      color: "#f59e0b",
    },
    {
      name: "Diversification",
      score: diversificationScore(hhi),
      color: "#0ea5e9",
    },
    {
      name: "Liquidity",
      score: liquidityScore(summary.total_holdings),
      color: "#2dd4bf",
    },
    {
      name: "Momentum",
      score: momentumScore(winRate, totalReturn),
      color: "#818cf8",
    },
  ];

  // Weighted average (equal weights)
  const overall = Math.round(
    subsystems.reduce((sum, s) => sum + s.score, 0) / subsystems.length,
  );

  const recommendations = buildRecommendations(summary);

  return (
    <div className="space-y-6">
      {/* Score + subsystems */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Gauge */}
        <div className="rounded-2xl border border-teal-500/20 bg-teal-500/5 p-6 flex flex-col items-center justify-center gap-2">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">
            Overall Portfolio Health
          </h3>
          <CircleGauge score={overall} />
          <p className="text-xs text-slate-500 text-center max-w-xs">
            Composite of returns quality, risk management, diversification, liquidity, and momentum — all computed from your live portfolio data.
          </p>
        </div>

        {/* Subsystem bars */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">
            Subsystem Scores
          </h3>
          {subsystems.map((sub) => (
            <div key={sub.name}>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-sm text-slate-300 font-medium">{sub.name}</span>
                <span className="font-mono text-sm font-bold" style={{ color: sub.color }}>
                  {sub.score}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${sub.score}%`,
                    backgroundColor: sub.color,
                    boxShadow: `0 0 8px ${sub.color}50`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendations — generated from live metrics */}
      {recommendations.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">
            AI Recommendations
          </h3>
          <div className="space-y-3">
            {recommendations.map((rec, i) => {
              const cfg = PRIORITY_CONFIG[rec.priority];
              return (
                <div key={i} className="flex gap-3 items-start">
                  <span className={`shrink-0 mt-0.5 w-2 h-2 rounded-full ${cfg.dot}`} />
                  <div className="flex-1 flex flex-wrap gap-2 items-start">
                    <span
                      className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${cfg.badge}`}
                    >
                      {rec.priority}
                    </span>
                    <span className="text-sm text-slate-300 leading-relaxed">
                      {rec.text}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Info note */}
      <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 px-5 py-3 flex gap-3 items-start text-sm text-slate-400">
        <span className="text-teal-400 mt-0.5 shrink-0">✦</span>
        <span>
          Health scores are derived from live yfinance data and update with every portfolio upload.
          Scores above 70 indicate a well-managed portfolio. Act on high-priority recommendations first.
        </span>
      </div>
    </div>
  );
}
