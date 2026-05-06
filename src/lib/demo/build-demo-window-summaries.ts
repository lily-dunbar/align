import "server-only";

import type { PatternWindow } from "@/lib/patterns/types";
import type { PatternWindowSummaryResult } from "@/lib/patterns/window-summaries";

/** Rolling-window summary cards — plausible improvement vs prior window for demos. */
export function buildDemoPatternWindowSummaries(
  window: PatternWindow,
  labelDays: number,
): PatternWindowSummaryResult {
  const dayScale = Math.max(1, labelDays);
  const readingsPerDay = 288;
  return {
    window,
    labelDays,
    current: {
      avgGlucoseMgdl: 122,
      tirInRangePercent: 78.2,
      avgStepsPerDay: 8120,
      glucoseReadingsCount: readingsPerDay * dayScale,
      totalSteps: Math.round(8120 * dayScale),
    },
    previous: {
      avgGlucoseMgdl: 131,
      tirInRangePercent: 70.6,
      avgStepsPerDay: 7340,
      glucoseReadingsCount: Math.round(readingsPerDay * 0.92 * dayScale),
      totalSteps: Math.round(7340 * dayScale),
    },
  };
}
