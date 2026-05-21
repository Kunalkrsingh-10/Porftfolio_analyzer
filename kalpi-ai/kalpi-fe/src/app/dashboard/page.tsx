"use client";

import { useState, useCallback, useId } from "react";
import type { TabId, ChatMessage, PortfolioItem, PortfolioChartData, WhatIfData } from "./_types";
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
  none:            "performance",
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
  const uid = useId();
  let msgCounter = 0;
  const makeId = () => `${uid}-${Date.now()}-${msgCounter++}`;

  const handlePortfolioLoaded = useCallback(async (items: PortfolioItem[]) => {
    setPortfolioItems(items);
    setChartLoading(true);
    try {
      const data = await fetchChartData(items, "NS", "1y", 21);
      setChartData(data);
    } catch (err) {
      console.error("Chart data fetch failed:", err);
    } finally {
      setChartLoading(false);
    }
  }, []);

  const handleMessage = useCallback((userText: string) => {
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
      })
        .then((res) => {
          // Persist the returned session ID for subsequent messages
          if (res.chat_session_id) setChatSessionId(res.chat_session_id);

          // Surface what-if data into the canvas
          const whatIf = res.canvas_data?.what_if;
          if (whatIf) setWhatIfData(whatIf as WhatIfData);

          // Update suggestion chips
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
  }, [portfolioItems, chatMessages, chatSessionId]);

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
        const data = await fetchChartData(portfolio, "NS", "1y", 21);
        setChartData(data);
      } catch { /* non-fatal */ }
      finally { setChartLoading(false); }
    }
  }, []);

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
        onTabChange={handleTabChange}
        isTyping={isTyping}
        portfolioItems={portfolioItems}
        onPortfolioLoaded={handlePortfolioLoaded}
        chartLoading={chartLoading}
        suggestions={suggestions}
        chatSessionId={chatSessionId}
        onSessionSelect={handleSessionSelect}
        onSessionDeleted={handleSessionDeleted}
        onNewChat={handleNewChat}
      />
      <CanvasPanel
        activeTab={activeTab}
        chatTriggeredTab={latestTriggeredTab}
        onTabChange={handleTabChange}
        chartData={chartData}
        chartLoading={chartLoading}
        whatIfData={whatIfData}
        onPortfolioLoaded={handlePortfolioLoaded}
      />
    </div>
  );
}
