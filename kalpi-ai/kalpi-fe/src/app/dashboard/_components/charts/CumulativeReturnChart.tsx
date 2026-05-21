"use client";

import PlotlyChart from "../PlotlyChart";
import type { CumulativeReturnsData } from "../../_types";

const DARK_LAYOUT = {
  paper_bgcolor: "transparent",
  plot_bgcolor: "transparent",
  font: { color: "#94a3b8", family: "inherit" },
  xaxis: { gridcolor: "#1e293b", zerolinecolor: "#1e293b", tickfont: { size: 11 } },
  yaxis: { gridcolor: "#1e293b", zerolinecolor: "#1e293b", tickfont: { size: 11 }, ticksuffix: "" },
  legend: { bgcolor: "transparent", bordercolor: "transparent", font: { size: 11 } },
  margin: { l: 45, r: 10, t: 10, b: 40 },
  hovermode: "x unified" as const,
};

const TICKER_COLORS = [
  "#6366f1", "#0ea5e9", "#f59e0b", "#ec4899", "#8b5cf6",
  "#14b8a6", "#f97316", "#84cc16", "#06b6d4", "#e11d48",
];

interface Props {
  data: CumulativeReturnsData;
  height?: number;
}

export default function CumulativeReturnChart({ data, height = 260 }: Props) {
  const tickers = Object.keys(data.per_ticker ?? {});

  const traces: Plotly.Data[] = [
    {
      x: data.dates,
      y: data.portfolio,
      name: "My Portfolio",
      type: "scatter",
      mode: "lines",
      line: { color: "#10b981", width: 2.5 },
      hovertemplate: "%{y:.1f}<extra>Portfolio</extra>",
    },
    ...tickers.slice(0, 8).map((ticker, i) => ({
      x: data.dates,
      y: data.per_ticker[ticker],
      name: ticker,
      type: "scatter" as const,
      mode: "lines" as const,
      line: { color: TICKER_COLORS[i % TICKER_COLORS.length], width: 1.5, dash: "dot" as const },
      opacity: 0.7,
      hovertemplate: `%{y:.1f}<extra>${ticker}</extra>`,
      visible: "legendonly" as const,
    })),
  ];

  return (
    <PlotlyChart
      data={traces}
      layout={{ ...DARK_LAYOUT, height, yaxis: { ...DARK_LAYOUT.yaxis, title: { text: "Indexed (Base=100)" } } }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: "100%", height }}
      useResizeHandler
    />
  );
}
