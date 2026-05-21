"use client";

import type { WhatIfData, WhatIfDelta, WhatIfMetrics } from "../../_types";

interface Props {
  data: WhatIfData;
}

interface RowDef {
  label: string;
  key: keyof WhatIfMetrics;
  deltaKey: keyof WhatIfDelta;
  format: (v: number) => string;
  positiveIsBetter: boolean; // true = green when delta > 0, false = green when delta < 0
}

const ROWS: RowDef[] = [
  {
    label: "CAGR",
    key: "cagr_pct",
    deltaKey: "cagr_pct",
    format: (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`,
    positiveIsBetter: true,
  },
  {
    label: "Sharpe Ratio",
    key: "sharpe_ratio",
    deltaKey: "sharpe_ratio",
    format: (v) => v.toFixed(4),
    positiveIsBetter: true,
  },
  {
    label: "Max Drawdown",
    key: "max_drawdown_pct",
    deltaKey: "max_drawdown_pct",
    format: (v) => `${v.toFixed(2)}%`,
    positiveIsBetter: false,
  },
  {
    label: "Ann. Volatility",
    key: "annualized_volatility_pct",
    deltaKey: "annualized_volatility_pct",
    format: (v) => `${v.toFixed(2)}%`,
    positiveIsBetter: false,
  },
  {
    label: "VaR (95%)",
    key: "var_95_pct",
    deltaKey: "var_95_pct",
    format: (v) => `${v.toFixed(2)}%`,
    positiveIsBetter: false,
  },
];

function deltaColor(delta: number, positiveIsBetter: boolean): string {
  if (Math.abs(delta) < 0.0001) return "text-slate-400";
  const good = positiveIsBetter ? delta > 0 : delta < 0;
  return good ? "text-emerald-400" : "text-rose-400";
}

function DeltaArrow({ delta, positiveIsBetter }: { delta: number; positiveIsBetter: boolean }) {
  if (Math.abs(delta) < 0.0001) return <span className="text-slate-600 text-xs">—</span>;
  const good = positiveIsBetter ? delta > 0 : delta < 0;
  return (
    <svg
      className={`w-3 h-3 inline-block ${good ? "text-emerald-400" : "text-rose-400"}`}
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      {delta > 0 ? (
        <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
      ) : (
        <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
      )}
    </svg>
  );
}

export default function WhatIfCard({ data }: Props) {
  const { before, after, delta, trade, common_days } = data;

  const pctW = (w: number) => `${(w * 100).toFixed(1)}%`;

  return (
    <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/5 p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-indigo-400 mb-0.5">
            What-If Simulation
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/20 text-xs font-bold px-2.5 py-0.5">
              Sell {trade.sell_ticker} ({pctW(trade.sell_weight)})
            </span>
            <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
            <span className="rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 text-xs font-bold px-2.5 py-0.5">
              Buy {trade.buy_ticker} ({pctW(trade.buy_weight)})
            </span>
          </div>
        </div>
        {common_days && (
          <span className="text-[10px] text-slate-500 shrink-0">
            {common_days} trading days
          </span>
        )}
      </div>

      {/* Comparison table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left text-[10px] uppercase tracking-widest text-slate-500 pb-2 font-semibold w-36">
                Metric
              </th>
              <th className="text-right text-[10px] uppercase tracking-widest text-slate-500 pb-2 font-semibold">
                Before
              </th>
              <th className="text-center text-[10px] uppercase tracking-widest text-slate-500 pb-2 font-semibold">
                Delta
              </th>
              <th className="text-right text-[10px] uppercase tracking-widest text-slate-500 pb-2 font-semibold">
                After
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {ROWS.map((row) => {
              const bVal = before[row.key] as number | undefined;
              const aVal = after[row.key] as number | undefined;
              const dVal = delta[row.deltaKey] as number | undefined;

              if (bVal === undefined || aVal === undefined) return null;

              const d = dVal ?? 0;
              const dColor = deltaColor(d, row.positiveIsBetter);
              const dSign = d > 0 ? "+" : "";

              return (
                <tr key={row.label}>
                  <td className="py-2.5 text-slate-400 font-medium">{row.label}</td>
                  <td className="py-2.5 text-right font-mono text-slate-300">{row.format(bVal)}</td>
                  <td className="py-2.5 text-center">
                    <span className={`font-mono font-bold text-xs ${dColor} inline-flex items-center gap-0.5`}>
                      <DeltaArrow delta={d} positiveIsBetter={row.positiveIsBetter} />
                      {dSign}{row.format(Math.abs(d))}
                    </span>
                  </td>
                  <td className="py-2.5 text-right font-mono font-bold text-white">{row.format(aVal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Verdict */}
      {delta && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-xs text-slate-400">
          <span className="text-slate-300 font-semibold">Verdict: </span>
          {(() => {
            const improvements = [
              delta.cagr_pct > 0,
              delta.sharpe_ratio > 0,
              delta.max_drawdown_pct > 0,
            ].filter(Boolean).length;
            if (improvements === 3) return "This trade improves all three key metrics — CAGR, Sharpe, and Drawdown. Worth considering.";
            if (improvements === 2) return "This trade improves 2 out of 3 key metrics. Review the trade-off carefully before proceeding.";
            if (improvements === 1) return "Only one metric improves. This trade likely introduces more risk than reward.";
            return "All key metrics worsen. This trade is not recommended based on historical data.";
          })()}
        </div>
      )}
    </div>
  );
}
