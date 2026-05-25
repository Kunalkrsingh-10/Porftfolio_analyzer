"use client";

import type { TabId, TabConfig } from "../_types";

const TABS: TabConfig[] = [
  {
    id: "performance",
    label: "Performance",
    accentClass: "text-emerald-400",
    glowClass:  "shadow-emerald-500/20",
    borderClass: "border-emerald-500/40",
    activeBgClass: "bg-emerald-500/10",
  },
  {
    id: "risk",
    label: "Risk",
    accentClass: "text-rose-400",
    glowClass:  "shadow-rose-500/20",
    borderClass: "border-rose-500/40",
    activeBgClass: "bg-rose-500/10",
  },
  {
    id: "diversification",
    label: "Diversification",
    accentClass: "text-sky-400",
    glowClass:  "shadow-sky-500/20",
    borderClass: "border-sky-500/40",
    activeBgClass: "bg-sky-500/10",
  },
  {
    id: "benchmark",
    label: "Benchmark",
    accentClass: "text-indigo-400",
    glowClass:  "shadow-indigo-500/20",
    borderClass: "border-indigo-500/40",
    activeBgClass: "bg-indigo-500/10",
  },
  {
    id: "stress",
    label: "Stress",
    accentClass: "text-amber-400",
    glowClass:  "shadow-amber-500/20",
    borderClass: "border-amber-500/40",
    activeBgClass: "bg-amber-500/10",
  },
  {
    id: "health",
    label: "Health",
    accentClass: "text-teal-400",
    glowClass:  "shadow-teal-500/20",
    borderClass: "border-teal-500/40",
    activeBgClass: "bg-teal-500/10",
  },
];

// SVG icon paths keyed by tab id
const TAB_ICONS: Record<TabId, React.ReactNode> = {
  performance: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  risk: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  diversification: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
    </svg>
  ),
  benchmark: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  stress: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  health: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  ),
};

interface TabBarProps {
  activeTab: TabId;
  chatTriggeredTab?: TabId;
  onTabChange: (tab: TabId) => void;
}

export default function TabBar({ activeTab, chatTriggeredTab, onTabChange }: TabBarProps) {
  return (
    <div className="flex items-center gap-1 p-1.5 bg-slate-900/80 border border-slate-800 rounded-2xl backdrop-blur-sm overflow-x-auto scrollbar-none">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        const wasTriggered = chatTriggeredTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={[
              "relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap",
              isActive
                ? `${tab.activeBgClass} ${tab.accentClass} border ${tab.borderClass}`
                : "text-slate-500 hover:text-slate-300 hover:bg-slate-800",
            ].join(" ")}
          >
            <span className={isActive ? tab.accentClass : ""}>{TAB_ICONS[tab.id]}</span>
            {tab.label}

            {/* Dot indicator when this tab was triggered by chat */}
            {wasTriggered && !isActive && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export { TABS };
