"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { PlotParams } from "react-plotly.js";

const Plot = dynamic<PlotParams>(
  async () => {
    // plotly.js-dist-min ships no TypeScript declarations — any casts are intentional
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const Plotly: any = (await import("plotly.js-dist-min")).default;
    // react-plotly.js/factory is CJS; .default covers both ESM and CJS interop
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const factoryMod: any = await import("react-plotly.js/factory");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const createPlotlyComponent: any = factoryMod.default ?? factoryMod;
    return {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      default: createPlotlyComponent(Plotly) as ComponentType<PlotParams>,
    };
  },
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full w-full min-h-[200px]">
        <div className="w-6 h-6 rounded-full border-2 border-slate-600 border-t-slate-300 animate-spin" />
      </div>
    ),
  },
);

export default function PlotlyChart(props: PlotParams) {
  return <Plot {...props} />;
}
