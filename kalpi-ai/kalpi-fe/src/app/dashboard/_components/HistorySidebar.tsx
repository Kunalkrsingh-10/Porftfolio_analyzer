"use client";

import { useState, useEffect, useCallback } from "react";
import type { ChatMessage, PortfolioItem, TabId } from "../_types";
import { getChatHistory, getChatSession, deleteChatSession } from "@/lib/api";
import type { ChatSessionMeta } from "@/lib/api";

const CHART_TYPE_TO_TAB: Record<string, TabId> = {
  performance: "performance",
  risk:        "risk",
  comparison:  "benchmark",
  whatif:      "performance",
};

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const IconTrash = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const IconClose = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const IconPlus = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
);

const IconAlert = () => (
  <svg className="w-5 h-5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const IconClock = () => (
  <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

function Spinner({ size = "sm" }: { size?: "sm" | "xs" }) {
  const cls = size === "xs" ? "w-3 h-3 border" : "w-3.5 h-3.5 border-2";
  return (
    <div className={`${cls} rounded-full border-slate-600 border-t-emerald-500 animate-spin shrink-0`} />
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface HistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeSessionId: string | undefined;
  onSessionSelect: (
    sessionId: string,
    messages: ChatMessage[],
    portfolio: PortfolioItem[],
  ) => void;
  onSessionDeleted: (sessionId: string) => void;
  onNewChat: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HistorySidebar({
  isOpen,
  onClose,
  activeSessionId,
  onSessionSelect,
  onSessionDeleted,
  onNewChat,
}: HistorySidebarProps) {
  const [sessions, setSessions]         = useState<ChatSessionMeta[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete]   = useState<string | null>(null);
  const [deletingId, setDeletingId]         = useState<string | null>(null);

  // Fetch history whenever the sidebar opens
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    getChatHistory()
      .then((res) => setSessions(res.sessions))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isOpen]);

  // Dismiss confirm-delete when user clicks elsewhere
  useEffect(() => {
    if (!confirmDelete) return;
    const dismiss = () => setConfirmDelete(null);
    document.addEventListener("click", dismiss, { capture: true });
    return () => document.removeEventListener("click", dismiss, { capture: true });
  }, [confirmDelete]);

  // ── Select session ───────────────────────────────────────────────────────
  const handleSelect = useCallback(async (session: ChatSessionMeta) => {
    if (loadingSession) return;
    setLoadingSession(session.session_id);
    try {
      const full = await getChatSession(session.session_id);

      const messages: ChatMessage[] = full.messages.map((m, i) => ({
        id: `hist-${session.session_id.slice(0, 8)}-${i}`,
        role: m.role as "user" | "assistant",
        content: m.content,
        timestamp: new Date(m.timestamp),
        triggeredTab:
          m.role === "assistant" && m.chart_type
            ? (CHART_TYPE_TO_TAB[m.chart_type] as TabId | undefined)
            : undefined,
      }));

      const portfolio: PortfolioItem[] = full.portfolio_snapshot.map((p) => ({
        ticker: p.ticker,
        weight: p.weight,
      }));

      onSessionSelect(session.session_id, messages, portfolio);
      onClose();
    } catch (err: unknown) {
      console.error("Failed to load session:", err);
    } finally {
      setLoadingSession(null);
    }
  }, [loadingSession, onSessionSelect, onClose]);

  // ── Delete session (two-click confirm) ──────────────────────────────────
  const handleDeleteClick = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();

    if (confirmDelete !== sessionId) {
      setConfirmDelete(sessionId);
      return;
    }

    setConfirmDelete(null);
    setDeletingId(sessionId);
    deleteChatSession(sessionId)
      .then(() => {
        setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
        onSessionDeleted(sessionId);
      })
      .catch((err: Error) => console.error("Delete failed:", err))
      .finally(() => setDeletingId(null));
  }, [confirmDelete, onSessionDeleted]);

  const handleNewChat = () => { onNewChat(); onClose(); };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-slate-900">

      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3.5 border-b border-slate-800/60">
        <span className="text-sm font-bold text-slate-200 tracking-tight">Chat History</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleNewChat}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
          >
            <IconPlus />
            New chat
          </button>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all"
          >
            <IconClose />
          </button>
        </div>
      </div>

      {/* Body */}
      <div
        className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#1e293b transparent" }}
      >

        {/* Loading skeletons */}
        {loading && (
          <>
            {[72, 80, 64].map((h, i) => (
              <div
                key={i}
                className="rounded-xl bg-slate-800/40 animate-pulse"
                style={{ height: h }}
              />
            ))}
          </>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex flex-col items-center gap-2.5 py-10 text-center px-4">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
              <IconAlert />
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">{error}</p>
            <button
              onClick={() => { setError(null); setLoading(true); getChatHistory().then((r) => setSessions(r.sessions)).catch((e: Error) => setError(e.message)).finally(() => setLoading(false)); }}
              className="text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && sessions.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-14 text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/60 flex items-center justify-center">
              <IconClock />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400 mb-1">No history yet</p>
              <p className="text-xs text-slate-600 leading-relaxed max-w-[180px] mx-auto">
                Your conversations will appear here after you start chatting
              </p>
            </div>
          </div>
        )}

        {/* Session list */}
        {!loading && !error && sessions.map((session) => {
          const isActive   = session.session_id === activeSessionId;
          const isLoading  = loadingSession === session.session_id;
          const isDeleting = deletingId === session.session_id;
          const isConfirm  = confirmDelete === session.session_id;

          return (
            <div
              key={session.session_id}
              role="button"
              tabIndex={0}
              onClick={() => { if (!isLoading && !isDeleting) void handleSelect(session); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !isLoading && !isDeleting) void handleSelect(session); }}
              className={[
                "relative w-full text-left rounded-xl border px-3.5 py-3 transition-all cursor-pointer select-none",
                isActive
                  ? "bg-emerald-500/8 border-emerald-500/25 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]"
                  : "bg-slate-800/30 border-slate-700/40 hover:bg-slate-800/60 hover:border-slate-600/60",
                (isLoading || isDeleting) ? "opacity-60 pointer-events-none" : "",
              ].join(" ")}
            >
              {/* Row 1: active indicator + ticker chips */}
              <div className="flex items-center gap-1.5 mb-1.5 flex-wrap min-h-[20px]">
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                )}
                {session.portfolio_tickers.slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="rounded-md bg-slate-700/70 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-300 leading-none"
                  >
                    {t}
                  </span>
                ))}
                {session.portfolio_tickers.length > 4 && (
                  <span className="text-[10px] text-slate-500">
                    +{session.portfolio_tickers.length - 4}
                  </span>
                )}
                {session.portfolio_tickers.length === 0 && (
                  <span className="text-[10px] text-slate-600 italic">No portfolio</span>
                )}
              </div>

              {/* Row 2: last message preview */}
              {session.last_message_preview && (
                <p className="text-xs text-slate-400 line-clamp-1 mb-2 leading-relaxed">
                  {session.last_message_preview}
                </p>
              )}

              {/* Row 3: meta + delete */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-slate-600 shrink-0">
                  {session.message_count} msgs · {relativeTime(session.updated_at)}
                </span>

                <button
                  type="button"
                  onClick={(e) => handleDeleteClick(e, session.session_id)}
                  disabled={isDeleting}
                  title={isConfirm ? "Click again to confirm delete" : "Delete session"}
                  className={[
                    "flex items-center gap-1 shrink-0 rounded-lg px-1.5 py-1 text-[10px] font-medium transition-all",
                    isConfirm
                      ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                      : "text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100",
                  ].join(" ")}
                  style={{ opacity: isConfirm ? 1 : undefined }}
                >
                  {isDeleting ? (
                    <Spinner size="xs" />
                  ) : isConfirm ? (
                    <>
                      <IconTrash />
                      <span>Sure?</span>
                    </>
                  ) : (
                    <IconTrash />
                  )}
                </button>
              </div>

              {/* Loading overlay */}
              {isLoading && (
                <div className="absolute inset-0 rounded-xl flex items-center justify-center bg-slate-900/50">
                  <Spinner />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
