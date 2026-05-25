"use client";

import PlotlyChart from "../PlotlyChart";
import type { RollingVolatilityData } from "../../_types";

const DARK_LAYOUT = {
  paper_bgcolor: "transparent",
  plot_bgcolor: "transparent",
  font: { color: "#94a3b8", family: "inherit" },
  xaxis: { gridcolor: "#1e293b", zerolinecolor: "#1e293b", tickfont: { size: 11 } },
  yaxis: {
    gridcolor: "#1e293b",
    zerolinecolor: "#1e293b",
    tickfont: { size: 11 },
    ticksuffix: "%",
    title: { text: "Annualised Volatility (%)" },
  },
  margin: { l: 55, r: 10, t: 10, b: 40 },
  hovermode: "x unified" as const,
};

interface Props {
  data: RollingVolatilityData;
  window?: number;
  height?: number;
}

export default function RollingVolatilityChart({ data, window = 21, height = 220 }: Props) {
  const traces: Plotly.Data[] = [
    {
      x: data.dates,
      y: data.portfolio,
      name: `${window}-day Rolling Vol`,
      type: "scatter",
      mode: "lines",
      line: { color: "#f59e0b", width: 2 },
      fill: "tozeroy",
      fillcolor: "rgba(245,158,11,0.12)",
      hovertemplate: "%{y:.1f}%<extra>Rolling Vol</extra>",
    },
  ];

  return (
    <PlotlyChart
      data={traces}
      layout={{ ...DARK_LAYOUT, height }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: "100%", height }}
      useResizeHandler
    />
  );
}
