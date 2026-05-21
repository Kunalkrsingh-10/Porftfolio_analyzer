"use client";

import type { TabId, PortfolioChartData, WhatIfData, PortfolioItem } from "../_types";
import TabBar, { TABS } from "./TabBar";
import PortfolioEntryGrid from "./PortfolioEntryGrid";

import PerformanceTab     from "./tabs/PerformanceTab";
import RiskTab            from "./tabs/RiskTab";
import DiversificationTab from "./tabs/DiversificationTab";
import BenchmarkTab       from "./tabs/BenchmarkTab";
import StressTab          from "./tabs/StressTab";
import HealthTab          from "./tabs/HealthTab";

interface CanvasPanelProps {
  activeTab: TabId;
  chatTriggeredTab?: TabId;
  onTabChange: (tab: TabId) => void;
  chartData: PortfolioChartData | null;
  chartLoading: boolean;
  whatIfData?: WhatIfData | null;
  onPortfolioLoaded: (items: PortfolioItem[]) => void;
}

export default function CanvasPanel({
  activeTab,
  chatTriggeredTab,
  onTabChange,
  chartData,
  chartLoading,
  whatIfData,
  onPortfolioLoaded,
}: CanvasPanelProps) {
  const activeTabConfig = TABS.find((t) => t.id === activeTab)!;

  const tabContent: Record<TabId, React.ReactNode> = {
    performance:     <PerformanceTab    chartData={chartData} whatIfData={whatIfData} />,
    risk:            <RiskTab           chartData={chartData} />,
    diversification: <DiversificationTab chartData={chartData} />,
    benchmark:       <BenchmarkTab />,
    stress:          <StressTab />,
    health:          <HealthTab />,
  };

  // ── Empty state: no portfolio loaded yet ──────────────────────────────────
  if (!chartData && !chartLoading) {
    return (
      <section className="flex flex-col flex-1 min-h-0 bg-slate-950 overflow-hidden relative">
        {/* Subtle dot grid background */}
        <div className="absolute inset-0 bg-[radial-gradient(circle,#ffffff06_1px,transparent_1px)] bg-[size:28px_28px] pointer-events-none" />

        {/* Minimal top bar so the layout doesn't feel naked */}
        <div className="shrink-0 px-6 pt-5 pb-4 border-b border-slate-800/40 flex items-center gap-3 relative z-10">
          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-widest border bg-slate-800/60 text-slate-500 border-slate-700/60">
            No Portfolio
          </span>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Portfolio Intelligence Canvas
          </h1>
        </div>

        {/* Entry grid */}
        <div
          className="flex-1 overflow-y-auto relative z-10"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#334155 transparent" }}
        >
          <PortfolioEntryGrid onPortfolioLoaded={onPortfolioLoaded} />
        </div>
      </section>
    );
  }

  // ── Loading state (portfolio submitted, data fetching) ────────────────────
  if (!chartData && chartLoading) {
    return (
      <section className="flex flex-col flex-1 min-h-0 bg-slate-950 overflow-hidden items-center justify-center gap-5">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-2 border-slate-700" />
          <div className="absolute inset-0 rounded-full border-2 border-t-emerald-500 animate-spin" />
          <div className="absolute inset-2 rounded-full border border-emerald-500/20 animate-pulse" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-slate-300">Fetching live price data…</p>
          <p className="text-xs text-slate-500">Pulling NSE/BSE history from yfinance</p>
        </div>
      </section>
    );
  }

  // ── Main dashboard with tabs ───────────────────────────────────────────────
  return (
    <section className="flex flex-col flex-1 min-h-0 bg-slate-950 overflow-hidden">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-6 pt-5 pb-0 border-b border-slate-800/60">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-widest border ${
              chartData
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-slate-800/60 text-slate-500 border-slate-700/60"
            }`}>
              {chartLoading ? "Refreshing…" : "Live Data"}
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Portfolio Intelligence Canvas
            </h1>
          </div>

          {chatTriggeredTab && chatTriggeredTab !== activeTab && (
            <button
              onClick={() => onTabChange(chatTriggeredTab)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-medium hover:bg-indigo-500/20 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              AI suggested: {chatTriggeredTab}
            </button>
          )}
        </div>

        <TabBar
          activeTab={activeTab}
          chatTriggeredTab={chatTriggeredTab}
          onTabChange={onTabChange}
        />
      </div>

      {/* ── Tab label strip ───────────────────────────────────────────────── */}
      <div className="shrink-0 px-6 py-3 border-b border-slate-800/40 flex items-center gap-3">
        <div className={`w-1 h-5 rounded-full ${activeTabConfig.activeBgClass}`} />
        <span className={`text-sm font-bold ${activeTabConfig.accentClass}`}>
          {activeTabConfig.label}
        </span>
        <span className="text-slate-600 text-xs">— live data from yfinance</span>
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────── */}
      <div
        key={activeTab}
        className="flex-1 overflow-y-auto p-6"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#334155 transparent" }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
        <div className="relative max-w-5xl mx-auto">
          {tabContent[activeTab]}
        </div>
      </div>
    </section>
  );
}
