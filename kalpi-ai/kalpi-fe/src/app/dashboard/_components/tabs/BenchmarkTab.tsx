"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { BENCHMARK_TIMESERIES, BENCHMARK_STATS } from "../../_data/dummy";

const Stat = ({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) => (
  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
    <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1">{label}</div>
    <div className={`text-2xl font-bold font-mono ${color ?? "text-white"}`}>{value}</div>
    {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
  </div>
);

export default function BenchmarkTab() {
  const s = BENCHMARK_STATS;

  return (
    <div className="space-y-6">
      {/* Outperformance banner */}
      <div className="flex items-center justify-between rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-5">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1">12-Month Outperformance vs Nifty 50</div>
          <div className="text-sm text-slate-400">Portfolio +21.4% vs Nifty +16.8%</div>
        </div>
        <div className="text-5xl font-bold text-emerald-400 tracking-tight">
          +{s.outperformance}%
          <span className="block text-sm font-normal text-slate-400 text-right mt-1">Alpha</span>
        </div>
      </div>

      {/* Line chart */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4">
          Indexed Performance (Base = 100, May ʼ24)
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={BENCHMARK_TIMESERIES} margin={{ top: 10, right: 10, bottom: 0, left: -5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="month" tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis domain={[95, 130]} tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} />
            <ReferenceLine y={100} stroke="#334155" strokeDasharray="4 4" />
            <Tooltip
              contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: 12 }}
              itemStyle={{ color: "#f8fafc" }}
              labelStyle={{ color: "#94a3b8" }}
              formatter={(v, name) => [typeof v === "number" ? v.toFixed(1) : String(v), String(name)]}
            />
            <Legend
              formatter={(v) => <span style={{ color: "#94a3b8", fontSize: 12 }}>{v}</span>}
            />
            <Line type="monotone" dataKey="portfolio" name="My Portfolio"
              stroke="#10b981" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="nifty50" name="Nifty 50"
              stroke="#6366f1" strokeWidth={2} dot={false} strokeDasharray="5 3" activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="sensex" name="Sensex"
              stroke="#0ea5e9" strokeWidth={2} dot={false} strokeDasharray="3 3" activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Alpha" value={`+${s.alpha}%`} color="text-emerald-400" sub="vs Nifty 50" />
        <Stat label="Beta" value={`${s.beta}`} color="text-sky-400" sub="Market sensitivity" />
        <Stat label="Correlation" value={`${s.correlation}`} color="text-indigo-400" sub="vs Nifty 50" />
        <Stat label="Tracking Error" value={`${s.trackingError}%`} color="text-amber-400" sub="Annualised" />
      </div>

      {/* Info note */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-3 flex gap-3 items-start text-sm text-slate-400">
        <span className="text-indigo-400 mt-0.5 shrink-0">ℹ</span>
        <span>
          A beta of {s.beta} means your portfolio moves ~{Math.round(s.beta * 100)}% as much as the Nifty 50 on big market swings.
          An information ratio of {s.informationRatio} confirms consistent excess returns per unit of active risk.
        </span>
      </div>
    </div>
  );
}
