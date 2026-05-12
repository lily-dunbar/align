import "server-only";

import { DEMO_BG_CURVE_SEED } from "@/lib/demo/demo-bg-curve";
import { getDemoDayProfile } from "@/lib/demo/demo-day-profile";
import {
  computeDemoWindowTirAndMean,
  eachYmdInclusive,
} from "@/lib/demo/demo-patterns-compute";
import { formatYmdInZone } from "@/lib/patterns/format-ymd";
import { safeTimeZoneForPatterns } from "@/lib/patterns/safe-timezone";
import type { PatternWindow } from "@/lib/patterns/types";
import { rollingRangeUtc } from "@/lib/patterns/window";
import type { PatternWindowSummaryResult } from "@/lib/patterns/window-summaries";
import type { UserPreferences } from "@/lib/user-display-preferences";

function periodSummaryFromYmds(
  ymds: string[],
  labelDays: number,
  prefs: UserPreferences,
): PatternWindowSummaryResult["current"] {
  const seed = DEMO_BG_CURVE_SEED;
  const { tirInRangePercent, meanMgdl } = computeDemoWindowTirAndMean(
    ymds,
    seed,
    prefs.targetLowMgdl,
    prefs.targetHighMgdl,
  );
  let totalSteps = 0;
  for (const ymd of ymds) {
    totalSteps += getDemoDayProfile(ymd, seed).dailySteps;
  }
  const avgStepsPerDay =
    labelDays > 0 ? Math.round(totalSteps / labelDays) : 0;
  const glucoseReadingsCount = ymds.length * 288;

  return {
    avgGlucoseMgdl: meanMgdl,
    tirInRangePercent,
    avgStepsPerDay,
    glucoseReadingsCount,
    totalSteps,
  };
}

/**
 * Rolling-window summary cards — same date ranges as live Dexcom aggregation, but stats from demo synthesis.
 */
export function buildDemoPatternWindowSummaries(
  window: PatternWindow,
  at: Date,
  prefs: UserPreferences,
): PatternWindowSummaryResult {
  const tz = safeTimeZoneForPatterns(prefs.ianaTimeZone ?? undefined);
  const { startUtc: curStart, endUtcExclusive: curEnd, labelDays } = rollingRangeUtc(
    window,
    at,
  );

  const curStartYmd = formatYmdInZone(curStart, tz);
  const curEndYmd = formatYmdInZone(new Date(curEnd.getTime() - 1), tz);
  const ymdsCurrent = eachYmdInclusive(curStartYmd, curEndYmd);

  const prevEndExclusive = curStart;
  const prevStart = new Date(at.getTime() - 2 * labelDays * 24 * 60 * 60 * 1000);
  const prevStartYmd = formatYmdInZone(prevStart, tz);
  const prevEndYmd = formatYmdInZone(new Date(prevEndExclusive.getTime() - 1), tz);
  const ymdsPrev = eachYmdInclusive(prevStartYmd, prevEndYmd);

  return {
    window,
    labelDays,
    current: periodSummaryFromYmds(ymdsCurrent, labelDays, prefs),
    previous: periodSummaryFromYmds(ymdsPrev, labelDays, prefs),
  };
}
