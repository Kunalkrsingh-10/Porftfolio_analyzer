"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type CellStyle,
  type GridApi,
  type GridReadyEvent,
  type CellValueChangedEvent,
  type ICellRendererParams,
} from "ag-grid-community";

import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

ModuleRegistry.registerModules([AllCommunityModule]);

type Row = { ticker: string; weight: number };

interface Props {
  onAnalyze: (portfolio: Row[]) => void;
  analyzing?: boolean;
}

const SAMPLE_ROWS: Row[] = [
  { ticker: "RELIANCE.NS", weight: 40 },
  { ticker: "TCS.NS", weight: 35 },
  { ticker: "INFY.NS", weight: 25 },
];

export default function EmptyStateGrid({ onAnalyze, analyzing = false }: Props) {
  const gridApiRef = useRef<GridApi<Row> | null>(null);
  const [totalWeight, setTotalWeight] = useState<number>(100);
  const [rowCount, setRowCount] = useState<number>(3);

  const recomputeTotal = useCallback((api: GridApi<Row>) => {
    let sum = 0;
    let count = 0;
    api.forEachNode((node) => {
      sum += Number(node.data?.weight) || 0;
      count++;
    });
    setTotalWeight(Math.round(sum * 100) / 100);
    setRowCount(count);
  }, []);

  const onGridReady = useCallback(
    (params: GridReadyEvent<Row>) => {
      gridApiRef.current = params.api;
      recomputeTotal(params.api);
    },
    [recomputeTotal],
  );

  const onCellValueChanged = useCallback(
    (event: CellValueChangedEvent<Row>) => {
      recomputeTotal(event.api);
    },
    [recomputeTotal],
  );

  const handleAddRow = useCallback(() => {
    const api = gridApiRef.current;
    if (!api) return;
    api.applyTransaction({ add: [{ ticker: "", weight: 0 }] });
    recomputeTotal(api);
  }, [recomputeTotal]);

  const handleDeleteRow = useCallback(
    (data: Row) => {
      const api = gridApiRef.current;
      if (!api) return;
      api.applyTransaction({ remove: [data] });
      // applyTransaction is synchronous for ClientSideRowModel
      recomputeTotal(api);
    },
    [recomputeTotal],
  );

  const colDefs = useMemo<ColDef<Row>[]>(
    () => [
      {
        headerName: "#",
        valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1,
        width: 52,
        editable: false,
        sortable: false,
        cellStyle: { color: "#475569", fontSize: "12px" } as CellStyle,
      },
      {
        field: "ticker",
        headerName: "Ticker",
        editable: true,
        flex: 2,
        cellStyle: {
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontWeight: 600,
          letterSpacing: "0.03em",
        } as CellStyle,
      },
      {
        field: "weight",
        headerName: "Weight (%)",
        editable: true,
        flex: 1,
        type: "numericColumn",
        valueParser: (p) => Number(p.newValue) || 0,
        valueFormatter: (p) => `${p.value}%`,
        cellStyle: (p): CellStyle => ({
          color: Number(p.value) > 0 ? "#34d399" : "#f87171",
          fontWeight: 600,
        }),
      },
      {
        headerName: "",
        width: 48,
        editable: false,
        sortable: false,
        cellRenderer: (p: ICellRendererParams<Row>) => (
          <button
            onClick={() => handleDeleteRow(p.data!)}
            className="flex items-center justify-center w-6 h-6 text-slate-500 hover:text-rose-400 transition-colors rounded mt-[6px]"
            title="Delete row"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ),
      },
    ],
    [handleDeleteRow],
  );

  const handleDownloadCsv = useCallback(() => {
    const header = "ticker,weight";
    const body = SAMPLE_ROWS.map((r) => `${r.ticker},${r.weight}`).join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "portfolio_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleAnalyze = useCallback(() => {
    const api = gridApiRef.current;
    if (!api) return;
    const rows: Row[] = [];
    api.forEachNode((node) => {
      if (node.data?.ticker?.trim()) rows.push({ ticker: node.data.ticker.trim(), weight: Number(node.data.weight) || 0 });
    });
    onAnalyze(rows);
  }, [onAnalyze]);

  const isValid = Math.abs(totalWeight - 100) < 0.01;
  const hasRows = rowCount > 0;

  return (
    <div className="flex flex-col items-center justify-center flex-1 p-6 relative z-10">
      <div className="w-full max-w-2xl space-y-4">
        {/* Header */}
        <div className="text-center space-y-1.5 mb-2">
          <h2 className="text-2xl font-bold tracking-tight text-white">Build Your Portfolio</h2>
          <p className="text-slate-400 text-sm">
            Edit tickers and weights inline, then run the AI analysis.
          </p>
        </div>

        {/* Grid */}
        <div
          className="ag-theme-quartz-dark rounded-xl overflow-hidden border border-slate-700/60 shadow-xl"
          style={{ height: 240 }}
        >
          <AgGridReact<Row>
            theme="legacy"
            rowData={SAMPLE_ROWS}
            columnDefs={colDefs}
            onGridReady={onGridReady}
            onCellValueChanged={onCellValueChanged}
            singleClickEdit
            stopEditingWhenCellsLoseFocus
            domLayout="normal"
          />
        </div>

        {/* Weight validator */}
        <div
          className={`flex items-center justify-between rounded-xl px-4 py-3 border transition-colors ${
            isValid
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-amber-500/30 bg-amber-500/5"
          }`}
        >
          <span className="text-sm text-slate-400 font-medium">Total Weight</span>
          <div className="flex items-center gap-2.5">
            <span
              className={`text-xl font-bold tabular-nums ${isValid ? "text-emerald-400" : "text-amber-400"}`}
            >
              {totalWeight.toFixed(1)}%
            </span>
            {isValid ? (
              <span className="text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                Valid ✓
              </span>
            ) : (
              <span className="text-xs font-semibold text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                Must equal 100%
              </span>
            )}
          </div>
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleAddRow}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 hover:border-slate-600 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Row
          </button>

          <button
            onClick={handleDownloadCsv}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 hover:border-slate-600 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            CSV Template
          </button>

          <button
            onClick={handleAnalyze}
            disabled={!isValid || !hasRows || analyzing}
            className="ml-auto flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-slate-950 bg-emerald-500 rounded-xl hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 hover:-translate-y-0.5 hover:shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
          >
            {analyzing ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analyzing…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Analyze Portfolio
              </>
            )}
          </button>
        </div>

        {/* Hint tags */}
        <div className="flex gap-2 flex-wrap justify-center pt-1 opacity-50">
          {(["Performance", "Risk", "Diversification", "Benchmark", "Stress", "Health"] as const).map((t) => (
            <span key={t} className="px-2.5 py-1 rounded-full text-xs font-medium border border-slate-700 text-slate-500 bg-slate-900/50">
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
