"use client";

import { useState, useCallback, useId } from "react";
import type { PortfolioItem } from "../_types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GridRow {
  id: string;
  ticker: string;
  weight: string; // kept as string so partial input (e.g. "1.") works
}

type RowErrors = { ticker?: string; weight?: string };

// ── CSV template ──────────────────────────────────────────────────────────────

const TEMPLATE_ROWS = [
  ["RELIANCE", "25"],
  ["TCS", "20"],
  ["HDFCBANK", "15"],
  ["INFY", "15"],
  ["ICICIBANK", "10"],
  ["AXISBANK", "10"],
  ["BAJFINANCE", "5"],
];

function downloadTemplate() {
  const csv = ["ticker,weight", ...TEMPLATE_ROWS.map((r) => r.join(","))].join(
    "\n"
  );
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "kalpi_portfolio_template.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Inline icon helpers ───────────────────────────────────────────────────────

const IC = {
  plus: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  ),
  download: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  ),
  trash: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  check: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
  warn: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  arrowRight: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  ),
  spreadsheet: (
    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 10h18M3 14h18M10 3v18M6 3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6a3 3 0 013-3z" />
    </svg>
  ),
};

// ── Validation ────────────────────────────────────────────────────────────────

function validateRows(rows: GridRow[]): {
  errors: RowErrors[];
  weightSum: number;
  validRows: GridRow[];
  canAnalyze: boolean;
} {
  const allTickers = rows
    .map((r) => r.ticker.trim().toUpperCase())
    .filter(Boolean);

  const errors: RowErrors[] = rows.map((row) => {
    const err: RowErrors = {};
    const ticker = row.ticker.trim();
    const wNum = parseFloat(row.weight);
    const wEmpty = row.weight.trim() === "";

    if (!ticker && !wEmpty) err.ticker = "Required";
    if (ticker && wEmpty) err.weight = "Required";
    if (ticker && !wEmpty && (isNaN(wNum) || wNum <= 0))
      err.weight = "Must be > 0";
    if (
      ticker &&
      allTickers.filter((t) => t === ticker.toUpperCase()).length > 1
    )
      err.ticker = "Duplicate";

    return err;
  });

  const weightSum = rows.reduce((s, r) => {
    const w = parseFloat(r.weight);
    return s + (isNaN(w) ? 0 : w);
  }, 0);

  const validRows = rows.filter((r, i) => {
    const ticker = r.ticker.trim();
    const w = parseFloat(r.weight);
    return (
      ticker &&
      !isNaN(w) &&
      w > 0 &&
      !errors[i]?.ticker &&
      !errors[i]?.weight
    );
  });

  const sumOk = Math.abs(weightSum - 100) < 0.51;
  const noRowErrors = errors.every((e) => !e.ticker && !e.weight);
  const canAnalyze = sumOk && validRows.length > 0 && noRowErrors;

  return { errors, weightSum, validRows, canAnalyze };
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  onPortfolioLoaded: (items: PortfolioItem[]) => void;
}

const EMPTY_ROW_COUNT = 7;

export default function PortfolioEntryGrid({ onPortfolioLoaded }: Props) {
  const uid = useId();

  const makeId = (suffix: string | number) => `row-${uid}-${suffix}`;

  const [rows, setRows] = useState<GridRow[]>(() =>
    Array.from({ length: EMPTY_ROW_COUNT }, (_, i) => ({
      id: makeId(i),
      ticker: "",
      weight: "",
    }))
  );

  const { errors, weightSum, validRows, canAnalyze } = validateRows(rows);

  // ── Bar appearance ──────────────────────────────────────────────────────
  const clampedPct = Math.min((weightSum / 100) * 100, 100);
  const isOver = weightSum > 100.5;
  const isReady = Math.abs(weightSum - 100) < 0.51;
  const barColor = isReady
    ? "bg-emerald-500"
    : isOver
    ? "bg-rose-500"
    : weightSum > 85
    ? "bg-amber-500"
    : "bg-slate-600";

  const sumTextColor = isReady
    ? "text-emerald-400"
    : isOver
    ? "text-rose-400"
    : weightSum > 85
    ? "text-amber-400"
    : "text-slate-500";

  const sumLabel = isReady
    ? "Weights balanced — ready to analyze"
    : isOver
    ? `${(weightSum - 100).toFixed(1)}% over limit`
    : weightSum > 0
    ? `${(100 - weightSum).toFixed(1)}% remaining`
    : "Enter weights in the table above";

  // ── Row mutations ───────────────────────────────────────────────────────
  const addRow = useCallback(
    () =>
      setRows((p) => [...p, { id: makeId(Date.now()), ticker: "", weight: "" }]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const removeRow = useCallback(
    (id: string) =>
      setRows((p) => (p.length > 1 ? p.filter((r) => r.id !== id) : p)),
    []
  );

  const setTicker = useCallback(
    (id: string, v: string) =>
      setRows((p) =>
        p.map((r) =>
          r.id === id
            ? { ...r, ticker: v.toUpperCase().replace(/[^A-Z0-9&-]/g, "") }
            : r
        )
      ),
    []
  );

  const setWeight = useCallback((id: string, v: string) => {
    // Allow digits + single decimal point
    if (v !== "" && !/^\d*\.?\d*$/.test(v)) return;
    setRows((p) => p.map((r) => (r.id === id ? { ...r, weight: v } : r)));
  }, []);

  const resetTable = useCallback(
    () =>
      setRows(
        Array.from({ length: EMPTY_ROW_COUNT }, (_, i) => ({
          id: makeId(`reset-${i}`),
          ticker: "",
          weight: "",
        }))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Enter on last weight cell → append row
  const onWeightKeyDown = useCallback(
    (e: React.KeyboardEvent, idx: number) => {
      if (e.key === "Enter" && idx === rows.length - 1) {
        e.preventDefault();
        addRow();
      }
    },
    [rows.length, addRow]
  );

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleAnalyze = useCallback(() => {
    if (!canAnalyze) return;
    const items: PortfolioItem[] = validRows.map((r) => ({
      ticker: r.ticker.trim().toUpperCase(),
      weight: parseFloat(r.weight) / 100,
    }));
    // Normalise so fractions sum exactly to 1.0
    const total = items.reduce((s, r) => s + r.weight, 0);
    onPortfolioLoaded(items.map((r) => ({ ...r, weight: r.weight / total })));
  }, [canAnalyze, validRows, onPortfolioLoaded]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center justify-start min-h-full py-10 px-4">
      {/* Hero */}
      <div className="text-center mb-8 max-w-md">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 mb-4 shadow-xl shadow-emerald-900/40">
          {IC.spreadsheet}
        </div>
        <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">
          Build Your Portfolio
        </h2>
        <p className="text-sm text-slate-400 leading-relaxed">
          Enter NSE/BSE tickers and allocation weights. Weights must add up to{" "}
          <span className="text-slate-300 font-medium">100%</span>.
        </p>
      </div>

      {/* Card */}
      <div className="w-full max-w-2xl rounded-2xl border border-slate-700/60 bg-slate-900/60 shadow-2xl backdrop-blur-sm overflow-hidden">

        {/* Card header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-700/60 bg-slate-800/40">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="text-sm font-semibold text-slate-200">
              Portfolio Holdings
            </span>
            {validRows.length > 0 && (
              <span className="rounded-full bg-emerald-500/15 border border-emerald-500/25 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                {validRows.length} valid
              </span>
            )}
          </div>

          <button
            onClick={downloadTemplate}
            className="flex items-center gap-1.5 rounded-lg border border-slate-600/60 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-400 hover:border-emerald-500/40 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
          >
            {IC.download}
            Download Template
          </button>
        </div>

        {/* Spreadsheet table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-700/60 bg-slate-800/30">
                <th className="w-10 px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 select-none">
                  #
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Ticker
                </th>
                <th className="w-40 px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Weight (%)
                </th>
                <th className="w-10 px-2 py-2.5" aria-label="actions" />
              </tr>
            </thead>

            <tbody>
              {rows.map((row, i) => {
                const err = errors[i] ?? {};
                const filled = !!(row.ticker.trim() || row.weight.trim());
                const rowOk =
                  filled && !err.ticker && !err.weight && !!row.ticker && !!row.weight;

                return (
                  <tr
                    key={row.id}
                    className={[
                      "border-b border-slate-800/50 transition-colors group",
                      err.ticker || err.weight
                        ? "bg-rose-500/5"
                        : rowOk
                        ? "bg-emerald-500/[0.03]"
                        : "hover:bg-slate-800/20",
                    ].join(" ")}
                  >
                    {/* Row number */}
                    <td className="px-3 py-2 text-xs text-slate-600 font-mono select-none tabular-nums">
                      {i + 1}
                    </td>

                    {/* Ticker input */}
                    <td className="px-2 py-1.5">
                      <div className="space-y-0.5">
                        <input
                          type="text"
                          value={row.ticker}
                          onChange={(e) => setTicker(row.id, e.target.value)}
                          placeholder="e.g. RELIANCE"
                          maxLength={20}
                          className={[
                            "w-full rounded-lg px-2.5 py-1.5 text-sm font-mono tracking-wide bg-slate-950/70 border placeholder-slate-700 focus:outline-none focus:ring-1 transition-all",
                            err.ticker
                              ? "border-rose-500/50 text-rose-300 focus:ring-rose-500/30 focus:border-rose-500"
                              : row.ticker
                              ? "border-emerald-500/30 text-emerald-100 focus:ring-emerald-500/30 focus:border-emerald-500/60"
                              : "border-slate-700/50 text-slate-100 focus:ring-emerald-500/25 focus:border-emerald-500/50",
                          ].join(" ")}
                        />
                        {err.ticker && (
                          <p className="text-[10px] text-rose-400 px-1 leading-none">
                            {err.ticker}
                          </p>
                        )}
                      </div>
                    </td>

                    {/* Weight input */}
                    <td className="px-2 py-1.5">
                      <div className="space-y-0.5">
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.weight}
                            onChange={(e) => setWeight(row.id, e.target.value)}
                            onKeyDown={(e) => onWeightKeyDown(e, i)}
                            placeholder="0.00"
                            className={[
                              "w-full rounded-lg px-2.5 py-1.5 pr-7 text-sm bg-slate-950/70 border placeholder-slate-700 focus:outline-none focus:ring-1 transition-all text-right tabular-nums",
                              err.weight
                                ? "border-rose-500/50 text-rose-300 focus:ring-rose-500/30 focus:border-rose-500"
                                : row.weight
                                ? "border-emerald-500/30 text-slate-100 focus:ring-emerald-500/30 focus:border-emerald-500/60"
                                : "border-slate-700/50 text-slate-100 focus:ring-emerald-500/25 focus:border-emerald-500/50",
                            ].join(" ")}
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                            %
                          </span>
                        </div>
                        {err.weight && (
                          <p className="text-[10px] text-rose-400 px-1 text-right leading-none">
                            {err.weight}
                          </p>
                        )}
                      </div>
                    </td>

                    {/* Delete */}
                    <td className="px-2 py-2">
                      <button
                        onClick={() => removeRow(row.id)}
                        disabled={rows.length <= 1}
                        title="Remove row"
                        className="rounded-lg p-1 text-slate-700 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-0 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                      >
                        {IC.trash}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Add row */}
        <div className="px-4 py-2 border-b border-slate-700/40">
          <button
            onClick={addRow}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
          >
            {IC.plus}
            Add row
          </button>
        </div>

        {/* Weight-sum bar + status */}
        <div className="px-5 py-4 bg-slate-800/30 space-y-2.5">
          <div className="flex items-center gap-3">
            {/* Bar track */}
            <div className="relative flex-1 h-2 rounded-full bg-slate-700/60 overflow-hidden">
              {/* Danger zone overlay at 100% mark */}
              <div
                className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                style={{ width: `${clampedPct}%` }}
              />
            </div>
            <span
              className={`w-24 text-right text-xs font-bold tabular-nums ${sumTextColor}`}
            >
              {weightSum.toFixed(1)}% / 100%
            </span>
          </div>

          {/* Segment markers */}
          <div className="flex gap-2 items-center">
            <span className={`flex items-center gap-1.5 text-xs ${sumTextColor}`}>
              {isReady ? IC.check : IC.warn}
              {sumLabel}
            </span>
            {!isReady && weightSum > 0 && (
              <span className="ml-auto text-[10px] text-slate-600">
                ±0.5% tolerance accepted
              </span>
            )}
          </div>

          {/* Per-weight bar segments for each holding */}
          {validRows.length > 1 && (
            <div className="flex h-1 rounded-full overflow-hidden gap-px mt-1">
              {validRows.map((r, i) => {
                const w = parseFloat(r.weight);
                const COLORS = [
                  "bg-emerald-500", "bg-sky-500", "bg-indigo-500",
                  "bg-violet-500", "bg-amber-500", "bg-rose-400",
                  "bg-teal-500", "bg-pink-500", "bg-orange-500",
                ];
                return (
                  <div
                    key={r.id}
                    title={`${r.ticker}: ${w.toFixed(1)}%`}
                    className={`${COLORS[i % COLORS.length]!} transition-all duration-300`}
                    style={{ width: `${(w / weightSum) * 100}%` }}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-700/40">
          <button
            onClick={resetTable}
            className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
          >
            Clear table
          </button>

          <button
            onClick={handleAnalyze}
            disabled={!canAnalyze}
            className={[
              "flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200",
              canAnalyze
                ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400 hover:shadow-lg hover:shadow-emerald-900/40 hover:scale-105 active:scale-100"
                : "bg-slate-700/50 text-slate-500 cursor-not-allowed",
            ].join(" ")}
          >
            Analyze Portfolio
            {IC.arrowRight}
          </button>
        </div>
      </div>

      {/* Tip */}
      <p className="mt-5 text-xs text-slate-600 text-center max-w-sm leading-relaxed">
        Tip: You can also attach a <span className="text-slate-500">.csv</span> or{" "}
        <span className="text-slate-500">.xlsx</span> file using the{" "}
        <span className="text-slate-500">📎</span> icon in the chat panel.
      </p>
    </div>
  );
}
