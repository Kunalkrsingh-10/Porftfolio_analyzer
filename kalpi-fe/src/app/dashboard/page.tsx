"use client";

import { useState, useCallback, useId } from "react";
import type { TabId, ChatMessage, PortfolioItem, PortfolioChartData, WhatIfData, Exchange, Period } from "./_types";
import { routeChat } from "./_utils/chatRouter";
import { fetchChartData, chatWithHistory } from "@/lib/api";
import ChatPanel from "./_components/ChatPanel";
import CanvasPanel from "./_components/CanvasPanel";

const CANVAS_VIEW_TO_TAB: Record<string, TabId> = {
  performance:     "performance",
  risk:            "risk",
  returns:         "performance",
  diversification: "diversification",
  holdings:        "diversification",
  comparison:      "performance",
  whatif:          "performance",
  none:            "performance",
};

// Period label → yfinance format for chart data fetch
const PERIOD_TO_YF: Record<Period, string> = {
  "1M": "1mo", "3M": "3mo", "6M": "6mo",
  "1Y": "1y",  "2Y": "2y",  "3Y": "3y",
};

// Tab → contextual AI question when user clicks "Ask AI" in canvas
const CHART_EXPLAIN_QUESTIONS: Record<TabId, string> = {
  performance:     "Explain my portfolio performance in detail — what's driving my CAGR and total returns?",
  risk:            "Analyse my portfolio risk — what are my biggest risk factors and how can I reduce them?",
  diversification: "How well diversified is my portfolio across sectors? What should I change?",
  benchmark:       "How does my portfolio compare to Nifty 50? Am I beating the market and by how much?",
  stress:          "How would my portfolio handle a major market crash? Which holdings are most vulnerable?",
  health:          "Give me a full portfolio health assessment with specific actionable recommendations.",
};

export default function DashboardPage() {
  const [activeTab, setActiveTab]                   = useState<TabId>("performance");
  const [chatMessages, setChatMessages]             = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping]                     = useState(false);
  const [latestTriggeredTab, setLatestTriggeredTab] = useState<TabId | undefined>();
  const [portfolioItems, setPortfolioItems]         = useState<PortfolioItem[]>([]);
  const [chartData, setChartData]                   = useState<PortfolioChartData | null>(null);
  const [whatIfData, setWhatIfData]                 = useState<WhatIfData | null>(null);
  const [chartLoading, setChartLoading]             = useState(false);
  const [suggestions, setSuggestions]               = useState<string[]>([]);
  const [chatSessionId, setChatSessionId]           = useState<string | undefined>(undefined);

  // Exchange & period — shared between chat + chart fetch
  const [exchange, setExchange] = useState<Exchange>("NSE");
  const [period, setPeriod]     = useState<Period>("1Y");

  const uid = useId();
  let msgCounter = 0;
  const makeId = () => `${uid}-${Date.now()}-${msgCounter++}`;

  const handlePortfolioLoaded = useCallback(async (
    items: PortfolioItem[],
    ex: Exchange = exchange,
    p: Period = period,
  ) => {
    setPortfolioItems(items);
    setChartLoading(true);
    try {
      const yfExchange = ex === "NSE" ? "NS" : "BO";
      const yfPeriod   = PERIOD_TO_YF[p];
      const data = await fetchChartData(items, yfExchange as "NS" | "BO", yfPeriod, 21);
      setChartData(data);
    } catch (err) {
      console.error("Chart data fetch failed:", err);
    } finally {
      setChartLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exchange, period]);

  const handleExchangeChange = useCallback((ex: Exchange) => {
    setExchange(ex);
    if (portfolioItems.length > 0) void handlePortfolioLoaded(portfolioItems, ex, period);
  }, [portfolioItems, period, handlePortfolioLoaded]);

  const handlePeriodChange = useCallback((p: Period) => {
    setPeriod(p);
    if (portfolioItems.length > 0) void handlePortfolioLoaded(portfolioItems, exchange, p);
  }, [portfolioItems, exchange, handlePortfolioLoaded]);

  const sendMessage = useCallback((userText: string) => {
    const userMsg: ChatMessage = {
      id: makeId(),
      role: "user",
      content: userText,
      timestamp: new Date(),
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    if (portfolioItems.length > 0) {
      chatWithHistory({
        user_message: userText,
        portfolio: portfolioItems,
        chat_session_id: chatSessionId,
        exchange,
        period,
      })
        .then((res) => {
          if (res.chat_session_id) setChatSessionId(res.chat_session_id);

          const whatIf = res.canvas_data?.what_if;
          if (whatIf) setWhatIfData(whatIf as WhatIfData);

          if (res.suggestions?.length) setSuggestions(res.suggestions);

          const triggeredTab = CANVAS_VIEW_TO_TAB[res.active_canvas_view] ?? "performance";
          const botMsg: ChatMessage = {
            id: makeId(),
            role: "assistant",
            content: res.bot_response,
            timestamp: new Date(),
            triggeredTab,
          };
          setChatMessages((prev) => [...prev, botMsg]);
          setIsTyping(false);
          setLatestTriggeredTab(triggeredTab);
          setActiveTab(triggeredTab);
        })
        .catch((err: Error) => {
          const botMsg: ChatMessage = {
            id: makeId(),
            role: "assistant",
            content: `Sorry, I couldn't process that request. (${err.message})`,
            timestamp: new Date(),
            isError: true,
            retryMessage: userText,
          };
          setChatMessages((prev) => [...prev, botMsg]);
          setIsTyping(false);
        });
    } else {
      const delay = 200 + Math.random() * 500;
      setTimeout(() => {
        const { response, triggeredTab } = routeChat(userText);
        const botMsg: ChatMessage = {
          id: makeId(),
          role: "assistant",
          content: response,
          timestamp: new Date(),
          triggeredTab,
        };
        setChatMessages((prev) => [...prev, botMsg]);
        setIsTyping(false);
        if (triggeredTab) {
          setLatestTriggeredTab(triggeredTab);
          setActiveTab(triggeredTab);
        }
      }, delay);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioItems, chatSessionId, exchange, period]);

  const handleMessage = sendMessage;

  const handleRetry = useCallback((userText: string) => {
    // Remove the last error message, then re-send
    setChatMessages((prev) => prev.filter((m) => !m.isError));
    sendMessage(userText);
  }, [sendMessage]);

  const handleExplainChart = useCallback((tab: TabId) => {
    handleMessage(CHART_EXPLAIN_QUESTIONS[tab]);
  }, [handleMessage]);

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
  }, []);

  const handleSessionSelect = useCallback(async (
    sessionId: string,
    messages: ChatMessage[],
    portfolio: PortfolioItem[],
  ) => {
    setChatSessionId(sessionId);
    setChatMessages(messages);
    if (portfolio.length > 0) {
      setPortfolioItems(portfolio);
      setChartLoading(true);
      try {
        const yfExchange = exchange === "NSE" ? "NS" : "BO";
        const yfPeriod   = PERIOD_TO_YF[period];
        const data = await fetchChartData(portfolio, yfExchange as "NS" | "BO", yfPeriod, 21);
        setChartData(data);
      } catch { /* non-fatal */ }
      finally { setChartLoading(false); }
    }
  }, [exchange, period]);

  const handleSessionDeleted = useCallback((sessionId: string) => {
    if (chatSessionId === sessionId) {
      setChatSessionId(undefined);
      setChatMessages([]);
    }
  }, [chatSessionId]);

  const handleNewChat = useCallback(() => {
    setChatSessionId(undefined);
    setChatMessages([]);
    setSuggestions([]);
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30">
      <ChatPanel
        messages={chatMessages}
        onMessage={handleMessage}
        onRetry={handleRetry}
        onTabChange={handleTabChange}
        isTyping={isTyping}
        portfolioItems={portfolioItems}
        onPortfolioLoaded={(items) => void handlePortfolioLoaded(items)}
        chartLoading={chartLoading}
        suggestions={suggestions}
        chatSessionId={chatSessionId}
        onSessionSelect={handleSessionSelect}
        onSessionDeleted={handleSessionDeleted}
        onNewChat={handleNewChat}
        exchange={exchange}
        period={period}
        onExchangeChange={handleExchangeChange}
        onPeriodChange={handlePeriodChange}
      />
      <CanvasPanel
        activeTab={activeTab}
        chatTriggeredTab={latestTriggeredTab}
        onTabChange={handleTabChange}
        chartData={chartData}
        chartLoading={chartLoading}
        whatIfData={whatIfData}
        onPortfolioLoaded={(items) => void handlePortfolioLoaded(items)}
        onAskAboutChart={handleExplainChart}
      />
    </div>
  );
}
