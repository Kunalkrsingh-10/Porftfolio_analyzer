"use client";

import type { PortfolioChartData } from "../../_types";
import type { PortfolioUploadSummary } from "@/lib/api";
import SectorPieChart from "../charts/SectorPieChart";

// ── Colour palette for sector progress bars ────────────────────────────────────
// Neutral slate for the "Others" aggregation bucket.
const SECTOR_COLORS = [
  "#6366f1", "#0ea5e9", "#10b981", "#f59e0b",
  "#f43f5e", "#8b5cf6", "#14b8a6", "#ec4899",
];
const OTHERS_COLOR = "#475569";

// ── Sector grouping ───────────────────────────────────────────────────────────
/**
 * When the portfolio spans more than MAX_DISPLAY sectors, keep the largest
 * MAX_DISPLAY sectors and fold the rest into a single "Others" bucket.
 *
 * Rules:
 *  - Sectors are sorted by value descending before slicing.
 *  - "Others" is appended last and always receives OTHERS_COLOR in the bar.
 *  - When ≤ MAX_DISPLAY sectors exist the data is returned unchanged so
 *    a 1-sector or 3-sector portfolio is never artificially truncated.
 */
const MAX_DISPLAY = 5;

type SectorRow = { name: string; value: number };

function groupSectors(rows: SectorRow[]): SectorRow[] {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  if (sorted.length <= MAX_DISPLAY) return sorted;

  const top = sorted.slice(0, MAX_DISPLAY);
  const othersValue = sorted
    .slice(MAX_DISPLAY)
    .reduce((sum, s) => sum + s.value, 0);

  return [
    ...top,
    { name: "Others", value: parseFloat(othersValue.toFixed(1)) },
  ];
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  chartData?: PortfolioChartData | null;
  summary?: PortfolioUploadSummary | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DiversificationTab({ chartData, summary }: Props) {
  const hasSectorData = (chartData?.sector_allocation?.labels?.length ?? 0) > 0;

  // ── Top positions from live holdings_breakdown ─────────────────────────────
  const topHoldings = summary?.holdings_breakdown
    ? [...summary.holdings_breakdown]
        .sort((a, b) => b.weight_pct - a.weight_pct)
        .slice(0, 6)
    : [];

  // ── Concentration risk ─────────────────────────────────────────────────────
  const concentrationRisk = summary?.concentration_risk ?? null;
  const hhi      = concentrationRisk?.hhi ?? null;
  const hhiLevel = concentrationRisk?.level ?? null;

  // ── Sector rows: raw → sorted → grouped ───────────────────────────────────
  // Source priority: chartData.sector_allocation → summary.sector_allocation
  const rawSectorRows: SectorRow[] = (() => {
    if (hasSectorData) {
      return chartData!.sector_allocation.labels.map((label, i) => ({
        name: label,
        value: chartData!.sector_allocation.values[i] ?? 0,
      }));
    }
    if (summary?.sector_allocation) {
      return Object.entries(summary.sector_allocation).map(([name, value]) => ({
        name,
        value,
      }));
    }
    return [];
  })();

  // Apply grouping: top-5 sectors + "Others" when needed
  const sectorRows = groupSectors(rawSectorRows);

  // ── Pie chart data: same grouped set ──────────────────────────────────────
  // Build a SectorAllocationData shape from the (possibly grouped) rows.
  const pieData = hasSectorData
    ? {
        labels: sectorRows.map((r) => r.name),
        values: sectorRows.map((r) => r.value),
      }
    : null;

  // Tell the user how many sectors were collapsed (if any)
  const hiddenSectorCount = Math.max(0, rawSectorRows.length - MAX_DISPLAY);

  return (
    <div className="space-y-6">
      {/* Donut + Sector weights */}
      <div className="grid lg:grid-cols-2 gap-6">

        {/* Sector pie */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-3 text-center">
            Sector Allocation
            {hiddenSectorCount > 0 && (
              <span className="ml-2 text-[10px] font-normal text-slate-600">
                (top {MAX_DISPLAY} + others)
              </span>
            )}
          </h3>
          {pieData ? (
            <SectorPieChart data={pieData} height={260} />
          ) : (
            <div className="flex items-center justify-center h-[260px] text-slate-500 text-sm">
              {summary
                ? "Sector chart data is loading — check docker logs if this persists."
                : "Upload a portfolio to see sector allocation."}
            </div>
          )}
        </div>

        {/* Sector progress bars — grouped, scrollable when tall */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4">
            Sector Weights
          </h3>
          {sectorRows.length > 0 ? (
            /*
             * max-h + overflow-y-auto: if the user hasn't uploaded yet and we
             * somehow receive > 8 bars, they scroll rather than overflow the card.
             * In practice, grouping keeps this to ≤ 6 rows, so the scrollbar
             * almost never appears.
             */
            <div className="space-y-3 overflow-y-auto max-h-[260px] pr-1"
              style={{ scrollbarWidth: "thin", scrollbarColor: "#334155 transparent" }}>
              {sectorRows.map((s, i) => {
                const color =
                  s.name === "Others"
                    ? OTHERS_COLOR
                    : SECTOR_COLORS[i % SECTOR_COLORS.length];
                return (
                  <div key={s.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-300 font-medium">{s.name}</span>
                      <span className="font-mono text-white text-xs">
                        {s.value.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.min(100, s.value)}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center flex-1 text-slate-500 text-sm">
              Upload a portfolio to see sector weights.
            </div>
          )}
        </div>
      </div>

      {/* Concentration + Top Holdings */}
      <div className="grid lg:grid-cols-2 gap-6">

        {/* HHI Card */}
        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-5 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">
            Concentration Analysis (HHI)
          </h3>
          {hhi !== null ? (
            <>
              <div className="flex items-end gap-4">
                <span className="text-5xl font-bold font-mono text-sky-400">
                  {hhi.toFixed(4)}
                </span>
                <span
                  className={`pb-1 text-sm font-bold px-2 py-0.5 rounded-lg border ${
                    hhiLevel === "Well Diversified"
                      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                      : hhiLevel === "Moderately Concentrated"
                      ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
                      : "text-rose-400 bg-rose-500/10 border-rose-500/20"
                  }`}
                >
                  {hhiLevel ?? "—"}
                </span>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                HHI below 0.15 indicates good diversification. Scores above 0.25
                signal dangerous concentration. Your score of {hhi.toFixed(4)}{" "}
                {hhi < 0.15
                  ? "is healthy."
                  : hhi < 0.25
                  ? "indicates moderate concentration — consider broadening holdings."
                  : "indicates high concentration — significant single-position risk."}
              </p>
              <div className="h-2 w-full rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full bg-gradient-to-r transition-all duration-700 ${
                    hhi < 0.15
                      ? "from-emerald-400 to-sky-400"
                      : hhi < 0.25
                      ? "from-amber-400 to-yellow-400"
                      : "from-rose-400 to-red-400"
                  }`}
                  style={{ width: `${Math.min((hhi / 0.5) * 100, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>0 (Perfect)</span>
                <span>0.25 (Concentrated)</span>
                <span>1.0 (Monopoly)</span>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
              Upload a portfolio to see concentration analysis.
            </div>
          )}
        </div>

        {/* Top positions */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4">
            Top {topHoldings.length > 0 ? topHoldings.length : ""} Positions
          </h3>
          {topHoldings.length > 0 ? (
            /*
             * Scrollable for unusual cases: capped at 6 by slice above, but
             * we wrap anyway so the card never overflows into sibling elements.
             */
            <div className="space-y-3 overflow-y-auto max-h-[260px] pr-1"
              style={{ scrollbarWidth: "thin", scrollbarColor: "#334155 transparent" }}>
              {topHoldings.map((h) => (
                <div key={h.ticker} className="flex items-center gap-3">
                  <span className="w-24 font-mono font-bold text-white text-sm shrink-0">
                    {h.ticker.replace(/\.(NS|BO)$/i, "")}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden min-w-0">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-sky-400 transition-all duration-700"
                      style={{ width: `${Math.min(h.weight_pct, 100)}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-xs font-mono text-slate-300 shrink-0">
                    {h.weight_pct.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
              Upload a portfolio to see top positions.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
