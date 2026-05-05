import "server-only";

import type { PatternWindow } from "@/lib/patterns/types";
import type { PatternWindowSummaryResult } from "@/lib/patterns/window-summaries";

/** Rolling-window summary cards — plausible improvement vs prior window for demos. */
export function buildDemoPatternWindowSummaries(
  window: PatternWindow,
  labelDays: number,
): PatternWindowSummaryResult {
  return {
    window,
    labelDays,
    current: {
      avgGlucoseMgdl: 124,
      tirInRangePercent: 76.4,
      avgStepsPerDay: 9680,
      glucoseReadingsCount: 3800 * Math.min(3, Math.ceil(labelDays / 7)),
      totalSteps: Math.round(9680 * labelDays),
    },
    previous: {
      avgGlucoseMgdl: 128,
      tirInRangePercent: 69.8,
      avgStepsPerDay: 8200,
      glucoseReadingsCount: 3500 * Math.min(3, Math.ceil(labelDays / 7)),
      totalSteps: Math.round(8200 * labelDays),
    },
  };
}
