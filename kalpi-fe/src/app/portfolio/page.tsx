/* eslint-disable */
"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  chatPortfolio, uploadPortfolioCsv,
  getPortfolioHistory, getPortfolio, fetchChartData, agentChat,
} from "@/lib/api";
import type { PortfolioItemReq } from "@/lib/api";
import dynamic from "next/dynamic";
const EmptyStateGrid = dynamic(() => import("./_components/EmptyStateGrid"), { ssr: false });
import type {
  PortfolioUploadSummary,
  PortfolioHistoryResponse, PortfolioHistoryItem,
} from "@/lib/api";
import type { TabId, PortfolioChartData, WhatIfData, AgentPortfolioMetrics } from "@/app/dashboard/_types";
import Link from "next/link";
import TabBar from "@/app/dashboard/_components/TabBar";
import PerformanceTab from "@/app/dashboard/_components/tabs/PerformanceTab";
import RiskTab from "@/app/dashboard/_components/tabs/RiskTab";
import DiversificationTab from "@/app/dashboard/_components/tabs/DiversificationTab";
import BenchmarkTab from "@/app/dashboard/_components/tabs/BenchmarkTab";
import StressTab from "@/app/dashboard/_components/tabs/StressTab";
import HealthTab from "@/app/dashboard/_components/tabs/HealthTab";

type ChatEntry = {
  type: "user" | "bot";
  text: string;
  active_canvas_view?: string;
  canvas_data?: any;
};

// Maps backend active_canvas_view → tab id.
// "comparison" and "whatif" are new values the backend now emits after the
// chat.py _CHART_TYPE_TO_CANVAS pass-through fix — map them to "performance"
// so the canvas always shows a meaningful tab instead of staying unchanged.
const CANVAS_TO_TAB: Record<string, TabId> = {
  performance:   "performance",
  returns:       "performance",
  comparison:    "performance",   // agent weighted-portfolio / single-stock response
  whatif:        "performance",   // agent what-if simulation response
  risk:          "risk",
  diversification: "diversification",
  holdings:      "performance",
};

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);

const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

function extractWhatIfData(canvas_data: any): WhatIfData | null {
  if (!canvas_data?.before || !canvas_data?.after || !canvas_data?.delta || !canvas_data?.trade) return null;
  return canvas_data as WhatIfData;
}

function StatChip({ label, value, color = "text-white" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5">
      <span className="text-slate-500 text-xs">{label}:</span>
      <span className={`font-semibold text-xs ${color}`}>{value}</span>
    </div>
  );
}

export default function PortfolioPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<PortfolioUploadSummary | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chatPrompt, setChatPrompt] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [chatting, setChatting] = useState(false);
  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioHistoryResponse | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("performance");
  const [chatTriggeredTab, setChatTriggeredTab] = useState<TabId | undefined>(undefined);
  const [chartData, setChartData] = useState<PortfolioChartData | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [whatIfData, setWhatIfData] = useState<WhatIfData | null>(null);
  const [gridAnalyzed, setGridAnalyzed] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  // Live portfolio metrics returned by the agent in chart_data.portfolio.
  // Populated by both handleChatSubmit (chatPortfolio) and handleGridAnalyze
  // (agentChat) so metric cards are never "—" after an AI response.
  const [agentPortfolio, setAgentPortfolio] = useState<AgentPortfolioMetrics | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const midUploadInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    getPortfolioHistory().then(setPortfolioHistory).catch(() => { });
  }, []);

  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, chatting]);

  const handleLogout = () => {
    document.cookie = "auth_token=; path=/; max-age=0";
    router.push("/auth");
  };

  const loadChartData = async (s: PortfolioUploadSummary) => {
    const items = s.holdings_breakdown
      .filter((h) => h.weight_pct > 0)
      .map((h) => ({ ticker: h.ticker, weight: h.weight_pct / 100 }));
    if (!items.length) return;

    setChartLoading(true);
    try {
      const data = await fetchChartData(items);
      setChartData(data as unknown as PortfolioChartData);
    } catch {
      // Non-critical; tabs show dummy data as fallback
    } finally {
      setChartLoading(false);
    }
  };

  const handleGridAnalyze = async (portfolio: PortfolioItemReq[]) => {
    setAnalyzing(true);
    setErrorMessage(null);
    try {
      const [chartResult, aiResult] = await Promise.all([
        fetchChartData(portfolio),
        agentChat(portfolio, "Give me a comprehensive analysis of this portfolio covering performance, risk, and diversification. Highlight key strengths and concerns."),
      ]);
      setChartData(chartResult as unknown as PortfolioChartData);
      setChatHistory([{
        type: "bot",
        text: aiResult.message,
        active_canvas_view: aiResult.chart_type !== "none" ? aiResult.chart_type : undefined,
        canvas_data: aiResult.chart_data ?? null,
      }]);

      // ── Persist live portfolio metrics so metric cards never show "—" ────────
      // chart_data.portfolio is present for comparison / single-stock responses.
      const gridPortfolio = (aiResult.chart_data as any)?.portfolio;
      if (gridPortfolio && typeof gridPortfolio === "object" && !gridPortfolio.error) {
        setAgentPortfolio(gridPortfolio as AgentPortfolioMetrics);
      }

      const targetTab = CANVAS_TO_TAB[aiResult.chart_type];
      if (targetTab) { setActiveTab(targetTab); setChatTriggeredTab(targetTab); }
      setGridAnalyzed(true);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Analysis failed. Check that the backend is running.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    setSelectedFile(e.target.files?.[0] ?? null);
  };

  // Unified upload handler — works for both initial and mid-session re-upload.
  // Does NOT blank sessionId/summary before the result is ready, so the dashboard
  // stays visible throughout the swap.
  const handleMidSessionUpload = async (file: File) => {
    setErrorMessage(null);
    setUploading(true);
    setChartData(null);   // tabs show loading state immediately
    setWhatIfData(null);
    setActiveTab("performance");

    const wasActive = !!(summary || gridAnalyzed);
    if (wasActive) {
      setChatHistory((prev) => [
        ...prev,
        { type: "bot", text: `Uploading "${file.name}"…` },
      ]);
    }

    try {
      const result = await uploadPortfolioCsv(file);
      setSummary(result);
      setSessionId(result.session_id);
      setGridAnalyzed(false);
      const msg = `${wasActive ? "New portfolio active" : "Portfolio analyzed"}: ${result.total_holdings} holdings worth ${fmtCurrency(result.portfolio_value)}. Return ${fmtPct(result.total_return_cumulative)} · Risk: ${result.risk_score.label}. Ask me anything.`;
      setChatHistory((prev) =>
        wasActive ? [...prev, { type: "bot", text: msg }] : [{ type: "bot", text: msg }],
      );
      void loadChartData(result);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Unable to upload portfolio.");
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = () => {
    if (!selectedFile) { setErrorMessage("Please choose a CSV file."); return; }
    void handleMidSessionUpload(selectedFile);
  };

  const loadHistoryItem = async (sid: string) => {
    setErrorMessage(null);
    setUploading(true);
    try {
      const result = await getPortfolio(sid);
      setSummary(result);
      setSessionId(result.session_id);
      setShowHistory(false);
      setChatHistory([{
        type: "bot",
        text: `Loaded past portfolio: ${result.total_holdings} holdings, ${fmtCurrency(result.portfolio_value)}. How can I help?`,
      }]);
      void loadChartData(result);
    } catch {
      setErrorMessage("Failed to load portfolio.");
    } finally {
      setUploading(false);
    }
  };

  const handleChatSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = chatPrompt.trim();
    if (!trimmed) return;

    setErrorMessage(null);
    setChatting(true);
    setChatPrompt("");
    setWhatIfData(null);

    setChatHistory((prev) => [...prev, { type: "user", text: trimmed }]);

    try {
      const response = await chatPortfolio(sessionId, trimmed);
      setChatHistory((prev) => [...prev, {
        type: "bot",
        text: response.bot_response,
        active_canvas_view: response.active_canvas_view,
        canvas_data: response.canvas_data ?? null,
      }]);

      const targetTab = CANVAS_TO_TAB[response.active_canvas_view];
      if (targetTab) {
        setActiveTab(targetTab);
        setChatTriggeredTab(targetTab);
      }

      if (response.canvas_data) {
        // What-if simulation data (before/after/delta)
        const wid = extractWhatIfData(response.canvas_data);
        if (wid) setWhatIfData(wid);

        // ── Persist portfolio metrics so metric cards never show "—" ──────────
        // Covers both chart_type='comparison' (weighted portfolio / single stock)
        // and chart_type='performance' / 'risk' where portfolio block may be present.
        const chatPortf = (response.canvas_data as any)?.portfolio;
        if (chatPortf && typeof chatPortf === "object" && !chatPortf.error) {
          setAgentPortfolio(chatPortf as AgentPortfolioMetrics);
        }
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Unable to connect to the AI analyst.");
      setChatHistory((prev) => [...prev, { type: "bot", text: "Sorry, I encountered an error. Please try again." }]);
    } finally {
      setChatting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleChatSubmit(); }
  };

  const renderTab = () => {
    if (chartLoading) {
      return (
        <div className="flex items-center justify-center h-64 gap-3 text-slate-400">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading chart data…
        </div>
      );
    }
    switch (activeTab) {
      case "performance": return <PerformanceTab chartData={chartData} whatIfData={whatIfData} summary={summary} agentPortfolio={agentPortfolio} />;
      case "risk":        return <RiskTab chartData={chartData} summary={summary} agentPortfolio={agentPortfolio} />;
      case "diversification": return <DiversificationTab chartData={chartData} summary={summary} />;
      case "benchmark":   return <BenchmarkTab />;
      case "stress":      return <StressTab summary={summary} agentPortfolio={agentPortfolio} />;
      case "health":      return <HealthTab summary={summary} />;
    }
  };

  return (
    <div className="flex h-screen w-full flex-col bg-slate-950 text-slate-100 md:flex-row overflow-hidden font-sans selection:bg-emerald-500/30">

      {/* ── LEFT PANE: Chat ─────────────────────────────────────────────────── */}
      <section className="flex w-full flex-col border-r border-slate-800/60 bg-slate-900/40 md:w-[420px] lg:w-[480px] shadow-2xl z-10">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/60 bg-slate-900/80 p-5 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-900/20 transition-transform hover:scale-105">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                <path fillRule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z" />
              </svg>
            </Link>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Kalpi Analyst
                <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                {sessionId ? `Session active · ${summary?.total_holdings} assets` : "AI Institutional Assistant"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowHistory(!showHistory)} className="p-2 text-slate-400 hover:text-emerald-400 transition-colors" title="History">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </button>
            <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-rose-400 transition-colors" title="Logout">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </div>
        </div>

        {/* Upload section */}
        {!sessionId && (
          <div className="p-6 m-4 mt-8 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/50 border border-slate-800 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <svg width="100" height="100" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" /></svg>
            </div>
            <h3 className="mb-2 text-sm font-bold text-emerald-400 uppercase tracking-widest">Portfolio Ingestion</h3>
            <p className="mb-5 text-sm text-slate-400 leading-relaxed">Upload a CSV with Ticker, Quantity, and Price columns to generate institutional-grade analytics.</p>
            <div className="flex flex-col gap-3">
              <div className="relative group">
                <input type="file" accept=".csv" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                <div className={`flex items-center justify-center w-full px-4 py-3 text-sm font-medium transition-all border-2 border-dashed rounded-xl ${selectedFile ? "border-emerald-500/50 bg-emerald-500/5 text-emerald-300" : "border-slate-700 bg-slate-800/50 text-slate-300 group-hover:border-slate-600 group-hover:bg-slate-800"}`}>
                  {selectedFile
                    ? <span className="flex items-center gap-2"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>{selectedFile.name}</span>
                    : "Choose CSV File"
                  }
                </div>
              </div>
              <button type="button" onClick={handleUpload} disabled={uploading || !selectedFile}
                className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition-all hover:shadow-emerald-500/40 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:transform-none disabled:shadow-none">
                {uploading
                  ? <span className="flex items-center justify-center gap-2"><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Synthesizing…</span>
                  : "Analyze Portfolio"
                }
              </button>
            </div>
            {errorMessage && (
              <div className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm font-medium text-rose-400 border border-rose-500/20 flex items-start gap-2">
                <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {errorMessage}
              </div>
            )}
          </div>
        )}

        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 scroll-smooth scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          {chatHistory.length === 0 && !sessionId && (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm px-6 text-center space-y-4 opacity-60">
              <svg className="w-12 h-12 text-slate-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              <p>Upload a portfolio to unlock AI insights, risk metrics, and deep factor analysis.</p>
            </div>
          )}

          {chatHistory.map((entry, i) => (
            <div key={i} className={`flex flex-col gap-1.5 ${entry.type === "user" ? "items-end" : "items-start"}`}>
              <div className="text-[11px] font-bold text-slate-500 px-2 uppercase tracking-wider flex items-center gap-1.5">
                {entry.type === "user"
                  ? <>You <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></>
                  : <><svg className="w-3 h-3 text-emerald-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg> Kalpi AI</>
                }
              </div>
              <div className={`max-w-[92%] rounded-2xl px-5 py-3.5 text-[15px] leading-relaxed shadow-sm ${entry.type === "user"
                ? "bg-slate-700 text-white rounded-br-sm shadow-slate-900/20"
                : "bg-emerald-950/20 text-slate-100 border border-emerald-500/20 rounded-bl-sm shadow-emerald-900/10"
                }`}>
                <p className="whitespace-pre-wrap">{entry.text}</p>
                {entry.active_canvas_view && entry.active_canvas_view !== "none" && (
                  <div className="mt-3 text-xs font-medium text-emerald-400 bg-emerald-950/30 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-emerald-500/10">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10" /></svg>
                    {CANVAS_TO_TAB[entry.active_canvas_view] ?? entry.active_canvas_view} tab updated
                  </div>
                )}
              </div>
            </div>
          ))}

          {chatting && (
            <div className="flex flex-col gap-1.5 items-start">
              <div className="text-[11px] font-bold text-slate-500 px-2 uppercase tracking-wider flex items-center gap-1.5">
                <svg className="w-3 h-3 text-emerald-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg> Kalpi AI
              </div>
              <div className="max-w-[90%] rounded-2xl bg-emerald-950/20 text-slate-100 border border-emerald-500/20 rounded-bl-sm px-5 py-4 flex items-center gap-2.5">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce" />
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "0.15s" }} />
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "0.3s" }} />
              </div>
            </div>
          )}
          <div ref={chatEndRef} className="h-1" />
        </div>

        {/* Chat input */}
        {/* Hidden file input for mid-session re-upload */}
        <input
          ref={midUploadInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleMidSessionUpload(file);
            e.target.value = "";
          }}
        />
        <div
          className={`relative p-4 bg-slate-900/90 backdrop-blur-lg border-t z-20 transition-colors ${isDragOver ? "border-emerald-500/60 bg-emerald-500/5" : "border-slate-800/60"}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) void handleMidSessionUpload(file);
          }}
        >
          {isDragOver && (
            <div className="absolute inset-x-4 inset-y-3 rounded-2xl border-2 border-dashed border-emerald-400 bg-emerald-500/10 flex items-center justify-center z-30 pointer-events-none">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Drop CSV / Excel to swap portfolio
              </div>
            </div>
          )}
          {uploading && (
            <div className="mb-2 flex items-center gap-2 text-xs text-emerald-400 font-medium px-1">
              <svg className="w-3.5 h-3.5 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analyzing new portfolio…
            </div>
          )}
          <form onSubmit={handleChatSubmit} className="relative group">
            <div className={`absolute -inset-0.5 rounded-2xl blur opacity-20 transition duration-500 group-hover:opacity-40 ${chatting ? "bg-slate-700" : "bg-emerald-400"}`} />
            {/* Attachment button — bottom-left inside the textarea */}
            <button
              type="button"
              title="Upload new portfolio (CSV / Excel)"
              disabled={uploading}
              onClick={() => midUploadInputRef.current?.click()}
              className="absolute bottom-3 left-3 z-10 rounded-lg p-1.5 text-slate-500 hover:text-emerald-400 hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            <textarea
              value={chatPrompt}
              onChange={(e) => setChatPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={sessionId || gridAnalyzed ? "E.g., Show risk metrics · What if I sell INFY and buy HDFC?" : "Upload a portfolio or drop a file here…"}
              disabled={chatting}
              className="relative w-full resize-none rounded-2xl bg-slate-950 border border-slate-700 pl-10 pr-14 py-3.5 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none disabled:opacity-60 transition-all shadow-inner"
              rows={2}
            />
            <button type="submit" disabled={!chatPrompt.trim() || chatting}
              className="absolute bottom-3.5 right-3.5 rounded-xl bg-emerald-500 p-2 text-slate-950 shadow-md shadow-emerald-500/20 transition-all hover:bg-emerald-400 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19V6m0 0l-5 5m5-5l5 5" /></svg>
            </button>
          </form>
        </div>
      </section>

      {/* ── RIGHT PANE: Analytics Canvas ───────────────────────────────────── */}
      <section className="flex-1 overflow-hidden bg-slate-950 relative flex flex-col">
        {/* Background grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

        {showHistory ? (
          <div className="flex-1 overflow-y-auto p-8 relative z-10">
            <h2 className="text-3xl font-bold text-white mb-6">Portfolio History</h2>
            {!portfolioHistory?.history?.length ? (
              <p className="text-slate-400">No past portfolios found.</p>
            ) : (
              <div className="space-y-4 max-w-4xl">
                {portfolioHistory.history.map((item: PortfolioHistoryItem) => (
                  <div key={item.session_id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center justify-between hover:border-emerald-500/30 transition-colors">
                    <div>
                      <h3 className="font-bold text-white text-lg">{item.file_name}</h3>
                      <p className="text-slate-400 text-sm mt-1">{new Date(item.uploaded_at).toLocaleString()}</p>
                      <div className="flex gap-4 mt-3 text-sm">
                        <span className="text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded">Return: {fmtPct(item.total_return_cumulative)}</span>
                        <span className="text-sky-400 bg-sky-500/10 px-2 py-1 rounded">Value: {fmtCurrency(item.portfolio_value)}</span>
                        <span className="text-slate-300 bg-slate-800 px-2 py-1 rounded">{item.total_holdings} Assets</span>
                      </div>
                    </div>
                    <button onClick={() => loadHistoryItem(item.session_id)} className="px-4 py-2 bg-emerald-500 text-slate-950 font-bold rounded-xl hover:bg-emerald-400 transition-colors">
                      Load
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : !summary && !gridAnalyzed ? (
          /* Empty state — interactive grid */
          <EmptyStateGrid onAnalyze={handleGridAnalyze} analyzing={analyzing} />
        ) : (
          /* Dashboard with tabs */
          <>
            {/* Portfolio stats strip — CSV upload (full stats) or agent analysis (partial) */}
            {(summary || agentPortfolio) && (
              <div className="flex flex-wrap items-center gap-3 px-6 py-3.5 border-b border-slate-800/60 bg-slate-900/60 backdrop-blur-sm relative z-10 shrink-0">
                <div className="flex items-center gap-2 mr-2">
                  <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Live Portfolio</span>
                  <span className="text-xs text-slate-600 select-none">·</span>
                  <span className="text-xs text-slate-500">
                    {summary
                      ? `${summary.total_holdings} Holdings`
                      : agentPortfolio?.tickers_used?.length
                      ? `${agentPortfolio.tickers_used.length} Asset${agentPortfolio.tickers_used.length !== 1 ? "s" : ""}`
                      : "Analysis Active"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 ml-auto">
                  {summary ? (
                    /* Full stats from CSV upload */
                    <>
                      <StatChip label="Value" value={fmtCurrency(summary.portfolio_value)} />
                      <StatChip
                        label="Return"
                        value={fmtPct(summary.total_return_cumulative)}
                        color={summary.total_return_cumulative >= 0 ? "text-emerald-400" : "text-rose-400"}
                      />
                      <StatChip label="Sharpe" value={summary.sharpe_ratio.toFixed(2)} color="text-sky-400" />
                      <StatChip label="Risk" value={summary.risk_score.label} color="text-amber-400" />
                      <StatChip label="Win Rate" value={`${summary.win_rate.win_rate}%`} color="text-indigo-400" />
                    </>
                  ) : (
                    /* Partial stats from agent response (no cost-basis / portfolio value available) */
                    <>
                      {agentPortfolio?.total_return_pct != null && (
                        <StatChip
                          label="Return"
                          value={fmtPct(agentPortfolio.total_return_pct)}
                          color={agentPortfolio.total_return_pct >= 0 ? "text-emerald-400" : "text-rose-400"}
                        />
                      )}
                      {agentPortfolio?.cagr_pct != null && (
                        <StatChip
                          label="CAGR"
                          value={fmtPct(agentPortfolio.cagr_pct)}
                          color={agentPortfolio.cagr_pct >= 0 ? "text-emerald-400" : "text-rose-400"}
                        />
                      )}
                      {agentPortfolio?.sharpe_ratio != null && (
                        <StatChip label="Sharpe" value={agentPortfolio.sharpe_ratio.toFixed(2)} color="text-sky-400" />
                      )}
                      {agentPortfolio?.annualized_volatility_pct != null && (
                        <StatChip
                          label="Vol."
                          value={`${agentPortfolio.annualized_volatility_pct.toFixed(1)}%`}
                          color="text-amber-400"
                        />
                      )}
                      {agentPortfolio?.latest_close != null && (
                        <StatChip
                          label="Price"
                          value={fmtCurrency(agentPortfolio.latest_close)}
                          color="text-sky-400"
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Tab bar */}
            <div className="px-6 py-3 bg-slate-950/80 border-b border-slate-800/40 relative z-10 shrink-0">
              <TabBar
                activeTab={activeTab}
                chatTriggeredTab={chatTriggeredTab}
                onTabChange={(tab) => { setActiveTab(tab); setChatTriggeredTab(undefined); }}
              />
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 relative z-10">
              {renderTab()}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
