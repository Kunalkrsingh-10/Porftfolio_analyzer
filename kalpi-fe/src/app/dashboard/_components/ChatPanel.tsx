"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ChatMessage, TabId, PortfolioItem, Exchange, Period } from "../_types";
import { SUGGESTED_QUESTIONS } from "../_data/dummy";
import HistorySidebar from "./HistorySidebar";

// ── Demo portfolios for first-time onboarding ─────────────────────────────────
const DEMO_PORTFOLIOS: {
  label: string;
  emoji: string;
  description: string;
  tickers: string[];
  items: PortfolioItem[];
}[] = [
  {
    label: "Nifty Blue-Chips",
    emoji: "🏛️",
    description: "Large-cap defensive",
    tickers: ["HDFCBANK", "RELIANCE", "TCS", "INFY", "ICICIBANK"],
    items: [
      { ticker: "HDFCBANK",  weight: 0.25 },
      { ticker: "RELIANCE",  weight: 0.20 },
      { ticker: "TCS",       weight: 0.20 },
      { ticker: "INFY",      weight: 0.15 },
      { ticker: "ICICIBANK", weight: 0.20 },
    ],
  },
  {
    label: "High Growth",
    emoji: "🚀",
    description: "New-age & momentum",
    tickers: ["ZOMATO", "IRCTC", "ADANIENT", "TATAPOWER", "HCLTECH"],
    items: [
      { ticker: "ZOMATO",    weight: 0.20 },
      { ticker: "IRCTC",     weight: 0.20 },
      { ticker: "ADANIENT",  weight: 0.25 },
      { ticker: "TATAPOWER", weight: 0.20 },
      { ticker: "HCLTECH",   weight: 0.15 },
    ],
  },
  {
    label: "Balanced Mix",
    emoji: "⚖️",
    description: "5-sector diversified",
    tickers: ["RELIANCE", "HDFCBANK", "SUNPHARMA", "WIPRO", "ITC"],
    items: [
      { ticker: "RELIANCE",  weight: 0.20 },
      { ticker: "HDFCBANK",  weight: 0.20 },
      { ticker: "SUNPHARMA", weight: 0.15 },
      { ticker: "WIPRO",     weight: 0.15 },
      { ticker: "ITC",       weight: 0.15 },
      { ticker: "KOTAKBANK", weight: 0.15 },
    ],
  },
];

// ── Period display labels ─────────────────────────────────────────────────────
const PERIODS: Period[] = ["1M", "3M", "6M", "1Y", "2Y", "3Y"];

// ── Formatted AI message: colors +/- percentages, bolds, and ₹ values ────────
function FormattedMessage({ text }: { text: string }) {
  type SegType = "text" | "pos" | "neg" | "bold" | "currency";
  const parts: { type: SegType; content: string }[] = [];

  // Order matters: **bold** first so ** doesn't confuse the % patterns
  const MASTER =
    /(\*\*([^*\n]+)\*\*)|((?<![.\d])[+＋][\d,.]+\s*%(?![\d]))|((?<![.\d])-[\d,.]+\s*%(?![\d]))|(₹[\d,]+(?:\.[\d]+)?(?:\s*(?:L|Cr|K|lakh|crore))?)/g;

  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = MASTER.exec(text)) !== null) {
    if (m.index > last) {
      parts.push({ type: "text", content: text.slice(last, m.index) });
    }
    if (m[1])      parts.push({ type: "bold",     content: m[2]! });
    else if (m[3]) parts.push({ type: "pos",      content: m[3] });
    else if (m[4]) parts.push({ type: "neg",      content: m[4] });
    else if (m[5]) parts.push({ type: "currency", content: m[5] });
    last = MASTER.lastIndex;
  }
  if (last < text.length) parts.push({ type: "text", content: text.slice(last) });

  return (
    <p className="whitespace-pre-wrap leading-relaxed text-sm">
      {parts.map((p, i) => {
        if (p.type === "pos")
          return <span key={i} className="text-emerald-400 font-semibold tabular-nums">{p.content}</span>;
        if (p.type === "neg")
          return <span key={i} className="text-rose-400 font-semibold tabular-nums">{p.content}</span>;
        if (p.type === "bold")
          return <strong key={i} className="text-white font-semibold">{p.content}</strong>;
        if (p.type === "currency")
          return <span key={i} className="text-amber-300 font-medium tabular-nums">{p.content}</span>;
        return <span key={i}>{p.content}</span>;
      })}
    </p>
  );
}

// ── CSV / Excel parsing ───────────────────────────────────────────────────────
function parseCsvToPortfolio(csv: string): PortfolioItem[] {
  const lines = csv.trim().split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = (lines[0] ?? "").toLowerCase().split(",").map((h) => h.trim());
  const rows = lines.slice(1);

  if (header.includes("weight") || header.length === 2) {
    const ti = 0;
    const wi = header.includes("weight") ? header.indexOf("weight") : 1;
    const raw = rows.flatMap((row) => {
      const cols = row.split(",");
      const ticker = cols[ti]?.trim().toUpperCase() ?? "";
      const weight = parseFloat(cols[wi] ?? "0");
      return ticker && weight > 0 ? [{ ticker, weight }] : [];
    });
    const total = raw.reduce((s, r) => s + r.weight, 0);
    return total > 0 ? raw.map((r) => ({ ticker: r.ticker, weight: r.weight / total })) : [];
  }

  const ti = header.includes("ticker") ? header.indexOf("ticker") : 0;
  const qi = header.includes("quantity") ? header.indexOf("quantity") : 1;
  const pi = header.includes("price") ? header.indexOf("price") : 2;
  const raw = rows.flatMap((row) => {
    const cols = row.split(",");
    const ticker = cols[ti]?.trim().toUpperCase();
    const qty    = parseFloat(cols[qi] ?? "0");
    const price  = parseFloat(cols[pi] ?? "0");
    const value  = qty * price;
    return ticker && value > 0 ? [{ ticker, weight: value }] : [];
  });
  const total = raw.reduce((s, r) => s + r.weight, 0);
  return total > 0 ? raw.map((r) => ({ ticker: r.ticker, weight: r.weight / total })) : [];
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconPaperclip = () => (
  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
  </svg>
);
const IconList = () => (
  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h8m-8 6h16" />
  </svg>
);
const IconSend = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V6m0 0l-5 5m5-5l5 5" />
  </svg>
);
const IconClose = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const IconCheckCircle = () => (
  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const IconHistory = () => (
  <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const IconWarn = () => (
  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const IconCopy = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);
const IconCheckTick = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);
const IconRetry = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);
const IconDownload = () => (
  <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);
const IconUploadCloud = () => (
  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
  </svg>
);

const KalpiAvatar = () => (
  <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shrink-0">
    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10" />
    </svg>
  </div>
);

// ── Props ─────────────────────────────────────────────────────────────────────
interface ChatPanelProps {
  messages: ChatMessage[];
  onMessage: (msg: string) => void;
  onRetry: (msg: string) => void;
  onTabChange: (tab: TabId) => void;
  isTyping: boolean;
  portfolioItems: PortfolioItem[];
  onPortfolioLoaded: (items: PortfolioItem[]) => void;
  chartLoading: boolean;
  suggestions?: string[];
  chatSessionId?: string;
  onSessionSelect?: (sessionId: string, messages: ChatMessage[], portfolio: PortfolioItem[]) => void;
  onSessionDeleted?: (sessionId: string) => void;
  onNewChat?: () => void;
  exchange: Exchange;
  period: Period;
  onExchangeChange: (ex: Exchange) => void;
  onPeriodChange: (p: Period) => void;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ChatPanel({
  messages,
  onMessage,
  onRetry,
  onTabChange,
  isTyping,
  portfolioItems,
  onPortfolioLoaded,
  chartLoading,
  suggestions = [],
  chatSessionId,
  onSessionSelect,
  onSessionDeleted,
  onNewChat,
  exchange,
  period,
  onExchangeChange,
  onPeriodChange,
}: ChatPanelProps) {
  const [input, setInput]               = useState("");
  const [showManual, setShowManual]     = useState(false);
  const [showHistory, setShowHistory]   = useState(false);
  const [manualInput, setManualInput]   = useState("");
  const [uploadError, setUploadError]   = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [copiedId, setCopiedId]         = useState<string | null>(null);
  const [dragOver, setDragOver]         = useState(false);

  const scrollRef   = useRef<HTMLDivElement>(null);
  const fileRef     = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  // Auto-dismiss success toast after 3 s
  useEffect(() => {
    if (!uploadSuccess) return;
    const t = setTimeout(() => setUploadSuccess(null), 3000);
    return () => clearTimeout(t);
  }, [uploadSuccess]);

  const submit = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    onMessage(text);
  }, [input, onMessage]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  // ── Copy message ─────────────────────────────────────────────────────────
  const handleCopy = useCallback((msgId: string, content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => {/* ignore */});
  }, []);

  // ── Export chat as Markdown ───────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (messages.length === 0) return;
    const lines = messages.map((msg) => {
      const time = msg.timestamp.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
      const role = msg.role === "user" ? "👤 **You**" : "🤖 **Kalpi AI**";
      return `### ${role}  _(${time})_\n\n${msg.content}`;
    });
    const header = `# Kalpi AI — Portfolio Analysis\n_Exported ${new Date().toLocaleDateString("en-IN")} · Exchange: ${exchange} · Period: ${period}_\n\n---\n\n`;
    const content = header + lines.join("\n\n---\n\n");
    const blob = new Blob([content], { type: "text/markdown" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `kalpi-analysis-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [messages, exchange, period]);

  // ── File processing ───────────────────────────────────────────────────────
  const processFile = useCallback(async (file: File) => {
    setUploadError(null);
    setUploadSuccess(null);

    if (file.name.toLowerCase().endsWith(".csv")) {
      const text  = await file.text();
      const items = parseCsvToPortfolio(text);
      if (items.length === 0) {
        setUploadError("Could not parse CSV. Expected: ticker,weight or ticker,quantity,price");
        return;
      }
      onPortfolioLoaded(items);
      setUploadSuccess(`${items.length} holdings loaded from ${file.name}`);
      return;
    }

    if (/\.xlsx?$/i.test(file.name)) {
      try {
        const XLSX = await import("xlsx");
        const ab   = await file.arrayBuffer();
        const wb   = XLSX.read(ab, { type: "array" });
        const ws   = wb.Sheets[wb.SheetNames[0]!];
        if (!ws) throw new Error("Empty workbook");
        const csv  = XLSX.utils.sheet_to_csv(ws);
        const items = parseCsvToPortfolio(csv);
        if (items.length === 0) {
          setUploadError("Could not parse Excel. Expected columns: ticker,weight or ticker,quantity,price");
          return;
        }
        onPortfolioLoaded(items);
        setUploadSuccess(`${items.length} holdings loaded from ${file.name}`);
      } catch {
        setUploadError("Excel parsing failed — save as CSV and try again.");
      }
      return;
    }

    setUploadError("Unsupported file type. Please upload a .csv or .xlsx file.");
  }, [onPortfolioLoaded]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
    e.target.value = "";
  };

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.items.length > 0) setDragOver(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
  }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void processFile(file);
  }, [processFile]);

  // ── Manual entry ──────────────────────────────────────────────────────────
  const handleManualSubmit = () => {
    setUploadError(null);
    const lines = manualInput.trim().split("\n").filter((l) => l.trim());
    const csv = "ticker,weight\n" + lines.map((l) => {
      const [t, w] = l.split(/[,:\s]+/);
      return `${t?.trim() ?? ""},${w?.trim() ?? ""}`;
    }).join("\n");
    const items = parseCsvToPortfolio(csv);
    if (items.length === 0) {
      setUploadError("Format: TICKER WEIGHT per line — e.g. RELIANCE 0.25");
      return;
    }
    onPortfolioLoaded(items);
    setUploadSuccess(`${items.length} holdings loaded`);
    setShowManual(false);
    setManualInput("");
  };

  const portfolioLoaded = portfolioItems.length > 0;

  // Suggestion chips: API chips override static defaults
  const chips: string[] =
    suggestions.length > 0
      ? suggestions
      : messages.length === 0
      ? SUGGESTED_QUESTIONS
      : [];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <section
      className="relative flex flex-col w-full md:w-[400px] lg:w-[440px] shrink-0 border-r border-slate-800/60 bg-slate-900/30 z-10 overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* ── Drag-and-drop overlay ────────────────────────────────────────── */}
      {dragOver && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-slate-900/92 border-2 border-dashed border-emerald-500/60 pointer-events-none">
          <div className="text-emerald-400 opacity-80"><IconUploadCloud /></div>
          <p className="text-sm font-semibold text-emerald-300">Drop your portfolio file here</p>
          <p className="text-xs text-slate-400">Supports .csv and .xlsx</p>
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-slate-800/60 bg-slate-900/80 px-4 py-3.5 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-900/30">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              Kalpi Analyst
              <span className={`w-1.5 h-1.5 rounded-full transition-colors ${
                portfolioLoaded ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
              }`} />
            </h2>
            <p className="text-[11px] text-slate-500 leading-none mt-0.5">
              {portfolioLoaded
                ? `${portfolioItems.length} holdings · ${exchange} · ${period} · Live AI`
                : "Demo mode — attach portfolio to unlock AI"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Export chat */}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleExport}
              title="Export chat as Markdown"
              className="rounded-xl p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-all"
            >
              <IconDownload />
            </button>
          )}

          {/* History toggle */}
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            title="View chat history"
            className={[
              "rounded-xl p-1.5 transition-all",
              showHistory
                ? "text-indigo-400 bg-indigo-500/15"
                : "text-slate-500 hover:text-slate-300 hover:bg-slate-700/50",
            ].join(" ")}
          >
            <IconHistory />
          </button>

          {portfolioLoaded ? (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 tracking-widest uppercase">
              Live
            </span>
          ) : (
            <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-0.5 text-[10px] font-medium text-slate-500 tracking-widest uppercase">
              Demo
            </span>
          )}
        </div>
      </div>

      {/* Loading bar */}
      {chartLoading && (
        <div className="h-[2px] w-full bg-slate-800/80 overflow-hidden shrink-0 relative">
          <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-emerald-500 to-transparent animate-shimmer" />
        </div>
      )}

      {/* ── Message history ───────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto px-4 py-5 space-y-5 min-h-0"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#1e293b transparent" }}
      >
        {/* Empty state */}
        {messages.length === 0 && (
          <div className="flex flex-col items-start justify-start h-full pb-6 select-none">
            {/* Hero */}
            <div className="flex flex-col items-center w-full mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center mb-3 shadow-xl shadow-emerald-900/40">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-300 mb-1">
                {portfolioLoaded ? "What would you like to know?" : "Your AI portfolio analyst is ready"}
              </p>
              <p className="text-xs text-slate-500 text-center max-w-[240px] leading-relaxed">
                {portfolioLoaded
                  ? "Ask about performance, risk, diversification, or simulate a trade"
                  : "Attach a CSV / Excel file, or try a demo portfolio below"}
              </p>
            </div>

            {/* Demo portfolio cards */}
            {!portfolioLoaded && (
              <div className="w-full space-y-2">
                <p className="text-center text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-2.5">
                  Try a demo portfolio
                </p>
                {DEMO_PORTFOLIOS.map((demo) => (
                  <button
                    key={demo.label}
                    onClick={() => onPortfolioLoaded(demo.items)}
                    className="w-full flex items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-800/40 px-3.5 py-2.5 text-left hover:border-emerald-500/40 hover:bg-slate-800/70 active:scale-[0.99] transition-all group"
                  >
                    <span className="text-xl shrink-0">{demo.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-200 group-hover:text-white transition-colors">{demo.label}</p>
                      <p className="text-[10px] text-slate-500">{demo.description}</p>
                    </div>
                    <div className="flex gap-1 flex-wrap justify-end shrink-0">
                      {demo.tickers.slice(0, 3).map((t) => (
                        <span key={t} className="text-[9px] font-mono text-slate-400 bg-slate-700/60 px-1.5 py-0.5 rounded-md">{t}</span>
                      ))}
                      {demo.tickers.length > 3 && (
                        <span className="text-[9px] text-slate-500">+{demo.tickers.length - 3}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="flex items-center gap-1.5 px-0.5 mb-0.5">
                <KalpiAvatar />
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Kalpi AI</span>
              </div>
            )}

            <div className={[
              "relative max-w-[88%] rounded-2xl px-4 py-3 group",
              msg.role === "user"
                ? "bg-slate-700/60 text-slate-100 rounded-tr-sm"
                : msg.isError
                  ? "bg-rose-500/8 border border-rose-500/20 text-slate-300 rounded-tl-sm"
                  : "bg-slate-800/70 text-slate-100 border border-slate-700/40 rounded-tl-sm",
            ].join(" ")}>

              {msg.role === "assistant" ? (
                <FormattedMessage text={msg.content} />
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
              )}

              {/* Retry button on error messages */}
              {msg.isError && msg.retryMessage && (
                <button
                  onClick={() => onRetry(msg.retryMessage!)}
                  className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 px-2.5 py-1 rounded-lg transition-all active:scale-95"
                >
                  <IconRetry />
                  Retry
                </button>
              )}

              {/* "View tab" deep-link */}
              {msg.triggeredTab && !msg.isError && (
                <button
                  onClick={() => onTabChange(msg.triggeredTab!)}
                  className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/15 hover:bg-indigo-500/20 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  View {msg.triggeredTab} analysis
                </button>
              )}

              {/* Copy button — shown on hover for assistant messages */}
              {msg.role === "assistant" && !msg.isError && (
                <button
                  onClick={() => handleCopy(msg.id, msg.content)}
                  title="Copy response"
                  className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 flex items-center justify-center w-6 h-6 rounded-lg bg-slate-700 border border-slate-600/60 text-slate-400 hover:text-white hover:bg-slate-600 transition-all shadow-lg"
                >
                  {copiedId === msg.id ? <IconCheckTick /> : <IconCopy />}
                </button>
              )}
            </div>

            <time className="text-[10px] text-slate-600 px-1">
              {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </time>
          </div>
        ))}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex flex-col gap-1 items-start">
            <div className="flex items-center gap-1.5 px-0.5 mb-0.5">
              <KalpiAvatar />
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Kalpi AI</span>
            </div>
            <div className="bg-slate-800/70 border border-slate-700/40 rounded-2xl rounded-tl-sm px-4 py-3.5 flex items-center gap-1.5">
              {[0, 160, 320].map((delay) => (
                <span
                  key={delay}
                  className="w-1.5 h-1.5 rounded-full bg-emerald-500/70 animate-bounce"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* ── Bottom input zone ─────────────────────────────────────────────── */}
      <div className="shrink-0 px-3 pb-3 pt-2 border-t border-slate-800/50 bg-slate-900/70 backdrop-blur-lg">

        {/* Exchange & Period selector (only when portfolio is loaded) */}
        {portfolioLoaded && (
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            {/* Exchange toggle */}
            <div className="flex rounded-lg border border-slate-700/50 overflow-hidden">
              {(["NSE", "BSE"] as Exchange[]).map((ex) => (
                <button
                  key={ex}
                  onClick={() => onExchangeChange(ex)}
                  disabled={isTyping || chartLoading}
                  className={[
                    "px-2.5 py-1 text-[10px] font-bold transition-colors border-r border-slate-700/50 last:border-0 disabled:opacity-40",
                    exchange === ex
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/60",
                  ].join(" ")}
                >
                  {ex}
                </button>
              ))}
            </div>

            {/* Period selector */}
            <div className="flex rounded-lg border border-slate-700/50 overflow-hidden">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  onClick={() => onPeriodChange(p)}
                  disabled={isTyping || chartLoading}
                  className={[
                    "px-2 py-1 text-[10px] font-bold transition-colors border-r border-slate-700/50 last:border-0 disabled:opacity-40",
                    period === p
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/60",
                  ].join(" ")}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Suggestion chips */}
        {chips.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2.5 scrollbar-none">
            {chips.map((q, i) => (
              <button
                key={i}
                onClick={() => onMessage(q)}
                disabled={isTyping || chartLoading}
                className="shrink-0 rounded-full border border-slate-700/60 bg-slate-800/50 px-3 py-1.5 text-xs text-slate-400 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Manual entry panel */}
        {showManual && (
          <div className="mb-2 rounded-2xl border border-slate-700/70 bg-slate-900/90 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Manual Entry
              </span>
              <button
                onClick={() => { setShowManual(false); setManualInput(""); setUploadError(null); }}
                className="rounded-lg p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-all"
              >
                <IconClose />
              </button>
            </div>
            <textarea
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder={"RELIANCE 0.25\nTCS 0.20\nINFY 0.15"}
              rows={3}
              className="w-full resize-none rounded-xl bg-slate-950 border border-slate-700/60 px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none font-mono transition-all"
            />
            {uploadError && (
              <p className="flex items-center gap-1.5 text-xs text-rose-400">
                <IconWarn /> {uploadError}
              </p>
            )}
            <button
              onClick={handleManualSubmit}
              disabled={!manualInput.trim()}
              className="w-full rounded-xl bg-emerald-500 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Load Portfolio
            </button>
          </div>
        )}

        {/* Toast feedback */}
        {uploadSuccess && !showManual && (
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
            <IconCheckCircle />
            <span className="text-xs text-emerald-400 truncate">{uploadSuccess}</span>
          </div>
        )}
        {uploadError && !showManual && (
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-2">
            <IconWarn />
            <span className="text-xs text-rose-400 truncate">{uploadError}</span>
          </div>
        )}

        {/* ── Unified input bar ─────────────────────────────────────────── */}
        <div className={[
          "flex items-end gap-1.5 rounded-2xl border px-3 py-2 transition-all duration-200",
          isTyping || chartLoading
            ? "border-slate-700/30 bg-slate-900/50"
            : "border-slate-700/60 bg-slate-900/80 focus-within:border-emerald-500/40 focus-within:bg-slate-900 focus-within:shadow-[0_0_0_3px_rgba(16,185,129,0.06)]",
        ].join(" ")}>

          {/* Left: attach + manual buttons */}
          <div className="flex items-center gap-0.5 shrink-0 mb-0.5">
            <button
              type="button"
              onClick={() => { setUploadError(null); fileRef.current?.click(); }}
              title="Attach portfolio CSV or Excel"
              disabled={isTyping || chartLoading}
              className="rounded-xl p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <IconPaperclip />
            </button>

            <button
              type="button"
              onClick={() => { setShowManual((v) => !v); setUploadError(null); }}
              title="Enter portfolio manually"
              disabled={isTyping || chartLoading}
              className={[
                "rounded-xl p-1.5 transition-all active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed",
                showManual
                  ? "text-emerald-400 bg-emerald-500/15"
                  : "text-slate-500 hover:text-slate-300 hover:bg-slate-700/50",
              ].join(" ")}
            >
              <IconList />
            </button>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={handleFile}
          />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={
              portfolioLoaded
                ? "Ask about your portfolio…"
                : "Ask anything, or attach a portfolio to start…"
            }
            disabled={isTyping || chartLoading}
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-slate-100 placeholder-slate-500/70 focus:outline-none leading-relaxed py-1 min-h-[24px] max-h-[120px] scrollbar-none disabled:opacity-50"
          />

          {/* Send button */}
          <button
            type="button"
            onClick={submit}
            disabled={!input.trim() || isTyping || chartLoading}
            className={[
              "shrink-0 mb-0.5 rounded-xl p-1.5 transition-all active:scale-90",
              input.trim() && !isTyping && !chartLoading
                ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400 hover:scale-105 shadow-lg shadow-emerald-900/30"
                : "bg-slate-700/50 text-slate-500 cursor-not-allowed opacity-40",
            ].join(" ")}
          >
            <IconSend />
          </button>
        </div>

        <p className="mt-2 text-center text-[10px] text-slate-600/70 select-none">
          ↵ send · ⇧↵ new line · 📎 drag & drop or attach CSV / Excel
        </p>
      </div>

      {/* ── History sidebar overlay ───────────────────────────────────────── */}
      <div
        className={`absolute inset-0 z-20 bg-slate-950/65 backdrop-blur-[1px] transition-opacity duration-200 ${
          showHistory ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setShowHistory(false)}
      />
      <div
        className={`absolute inset-0 z-30 transform transition-transform duration-200 ease-out ${
          showHistory ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <HistorySidebar
          isOpen={showHistory}
          onClose={() => setShowHistory(false)}
          activeSessionId={chatSessionId}
          onSessionSelect={(id, msgs, portfolio) => {
            onSessionSelect?.(id, msgs, portfolio);
            setShowHistory(false);
          }}
          onSessionDeleted={(id) => {
            onSessionDeleted?.(id);
          }}
          onNewChat={() => {
            onNewChat?.();
            setShowHistory(false);
          }}
        />
      </div>
    </section>
  );
}
