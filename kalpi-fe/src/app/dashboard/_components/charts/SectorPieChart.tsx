"use client";

import PlotlyChart from "../PlotlyChart";
import type { SectorAllocationData } from "../../_types";

// Ordered palette — the "Others" bucket always gets the neutral slate tone.
const SECTOR_COLORS = [
  "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#f43f5e",
  "#8b5cf6", "#14b8a6", "#ec4899", "#f97316", "#84cc16",
  "#06b6d4", "#e11d48", "#a3e635", "#fbbf24",
];
const OTHERS_COLOR = "#475569"; // slate-600 — neutral for aggregated "Others" bucket

interface Props {
  data: SectorAllocationData;
  height?: number;
}

export default function SectorPieChart({ data, height = 260 }: Props) {
  // Assign colours: "Others" always gets the neutral slate so it's visually
  // distinct from real sectors regardless of its position in the array.
  const colours = data.labels.map((label, i) =>
    label === "Others"
      ? OTHERS_COLOR
      : SECTOR_COLORS[i % SECTOR_COLORS.length],
  );

  const isSingle = data.labels.length === 1;

  const traces: Plotly.Data[] = [
    {
      labels: data.labels,
      values: data.values,
      type: "pie",
      hole: 0.5,
      marker: { colors: colours },
      // Show percentage text only when there are multiple slices; for a single
      // 100% sector it's obvious and the label just clutters the chart.
      textinfo: isSingle ? "none" : "percent",
      textfont: { size: 11, color: "#f8fafc", family: "inherit" },
      hovertemplate: "<b>%{label}</b><br>%{value:.1f}%<extra></extra>",
      sort: false,
    },
  ];

  return (
    <PlotlyChart
      data={traces}
      layout={{
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        font: { color: "#94a3b8", family: "inherit" },
        // Legend is meaningful only when ≥ 2 slices; suppress it for a single-
        // sector portfolio to avoid a lone entry floating beside a full circle.
        showlegend: !isSingle,
        legend: {
          bgcolor: "transparent",
          bordercolor: "transparent",
          font: { size: 11 },
          orientation: "v" as const,
        },
        // Annotations: for a single sector, place the sector name + 100% in the
        // donut hole so the chart isn't completely label-free.
        annotations: isSingle
          ? [
              {
                text: `<b>${data.labels[0]}</b><br>100%`,
                x: 0.5,
                y: 0.5,
                xref: "paper" as const,
                yref: "paper" as const,
                showarrow: false,
                font: { size: 12, color: "#f8fafc" },
                align: "center" as const,
              },
            ]
          : [],
        margin: { l: 0, r: 0, t: 0, b: 0 },
        height,
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: "100%", height }}
      useResizeHandler
    />
  );
}
