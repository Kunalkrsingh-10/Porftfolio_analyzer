"use client";

import React, { useState } from "react";

export default function MultiplicationTablePage() {
  const [baseNumber, setBaseNumber] = useState<number>(5);
  const [limit, setLimit] = useState<number>(10);

  // Handle inputs
  const handleBaseChange = (val: number) => {
    // Keep it reasonable, but allow input
    setBaseNumber(val);
  };

  const handleLimitChange = (val: number) => {
    setLimit(Math.min(Math.max(val, 1), 500)); // Cap limit to 500 for performance
  };

  return (
    <div className="min-h-screen bg-slate-900 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-slate-950 text-slate-100 p-4 md:p-8 font-sans selection:bg-cyan-500/30">
      <main className="max-w-6xl mx-auto flex flex-col gap-8">

        {/* Header Section */}
        <header className="w-full flex flex-col items-start gap-3">
          <span className="inline-flex items-center rounded-full bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-400 ring-1 ring-inset ring-violet-500/20 uppercase tracking-wider">
            SKDS Tech Lab
          </span>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            Dynamic{" "}
            <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
              Multiplier
            </span>
          </h1>
          <p className="text-slate-400 max-w-xl text-sm md:text-base">
            Instantly generate multiplication tables with beautiful glassmorphism design and real-time reactivity.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* Controls Panel (Left) */}
          <aside className="lg:col-span-4 sticky top-8">
            <div className="bg-slate-800/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 md:p-8 shadow-2xl">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 text-white">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-cyan-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
                Configuration
              </h2>

              {/* Base Number Selector */}
              <div className="mb-8 group">
                <div className="flex justify-between items-center mb-3">
                  <label htmlFor="baseInput" className="text-sm font-medium text-slate-300">
                    Base Number
                  </label>
                  <span className="text-sm font-bold text-violet-400 bg-violet-400/10 px-2.5 py-0.5 rounded-md">
                    {baseNumber}
                  </span>
                </div>

                {/* Range Slider */}
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={baseNumber}
                  onChange={(e) => handleBaseChange(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-violet-500 mb-4 transition-all"
                />

                {/* Number Input */}
                <div className="relative group-focus-within:ring-2 ring-violet-500/50 rounded-xl transition-all">
                  <input
                    id="baseInput"
                    type="number"
                    value={baseNumber}
                    onChange={(e) => handleBaseChange(Number(e.target.value))}
                    className="w-full bg-slate-900/60 border border-slate-700/50 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-violet-500 transition-colors"
                    placeholder="Enter base number..."
                  />
                </div>
              </div>

              {/* Limit Selector */}
              <div className="mb-4 group">
                <div className="flex justify-between items-center mb-3">
                  <label htmlFor="limitInput" className="text-sm font-medium text-slate-300">
                    Generate Up To
                  </label>
                  <span className="text-sm font-bold text-cyan-400 bg-cyan-400/10 px-2.5 py-0.5 rounded-md">
                    x {limit}
                  </span>
                </div>

                <div className="relative group-focus-within:ring-2 ring-cyan-500/50 rounded-xl transition-all">
                  <input
                    id="limitInput"
                    type="number"
                    value={limit}
                    onChange={(e) => handleLimitChange(Number(e.target.value))}
                    className="w-full bg-slate-900/60 border border-slate-700/50 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                    placeholder="Set limit..."
                  />
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex gap-2 mt-4">
                {[10, 20, 50].map((val) => (
                  <button
                    key={val}
                    onClick={() => handleLimitChange(val)}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all duration-200
                      ${limit === val
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                        : 'bg-slate-800 border-slate-700/50 text-slate-400 hover:bg-slate-700 hover:border-cyan-500/30'
                      }
                    `}
                  >
                    x {val}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* Table Grid (Right) */}
          <section className="lg:col-span-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: limit }, (_, i) => i + 1).map((multiplier) => {
                const result = baseNumber * multiplier;

                // Formatter to avoid crazy long decimals if user inputs floats
                const formatNum = (num: number) => Number.isInteger(num) ? num : parseFloat(num.toFixed(4));

                return (
                  <div
                    key={multiplier}
                    className="group flex items-center justify-between bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4 transition-all duration-300 hover:bg-slate-800/60 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(6,182,212,0.15)] hover:border-cyan-500/40"
                  >
                    {/* Equation Side */}
                    <div className="flex items-center gap-3 text-lg">
                      <span className="font-medium text-slate-200 w-10 text-right">
                        {formatNum(baseNumber)}
                      </span>
                      <span className="text-sm text-slate-500 group-hover:text-violet-400 transition-colors">
                        ×
                      </span>
                      <span className="font-medium text-slate-200 w-8 text-left">
                        {multiplier}
                      </span>
                    </div>

                    {/* Result Side */}
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-slate-500 group-hover:text-cyan-400 transition-colors">
                        =
                      </span>
                      <span className="font-bold text-xl text-white tracking-tight min-w-[3rem] text-right">
                        {formatNum(result)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
