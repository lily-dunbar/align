import "server-only";

import { DEMO_BG_CURVE_SEED } from "@/lib/demo/demo-bg-curve";
import {
  buildDemoDailyGlucoseSteps,
  buildDemoHourlyCurvesForDays,
  buildDemoSessionDeltaPoints,
  computeDemoSessionStats,
  computeDemoStepsStats,
  computeDemoTemporalFromDays,
  eachYmdInclusive,
  demoDailyMeanMgdl,
} from "@/lib/demo/demo-patterns-compute";
import { attachLearnMoreToPatterns } from "@/lib/patterns/enrich-pattern-learn-more";
import { formatYmdInZone } from "@/lib/patterns/format-ymd";
import { selectPatternsForDisplay } from "@/lib/patterns/select-for-display";
import type {
  PatternFeatureContext,
  PatternInsightJson,
  PatternsFeatureJson,
  PatternWindow,
} from "@/lib/patterns/types";
import type { UserPreferences } from "@/lib/user-display-preferences";

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function demoPatterns(threshold: number): PatternInsightJson[] {
  const base: PatternInsightJson[] = [
    {
      id: "demo-temporal-lunch",
      title: "Midday glucose shifts around logged lunch timing",
      description:
        "Logged lunch timing and midday glucose movement are close in clock time, but direction and size vary by day. Use this as timing context, not a fixed post-meal rise rule.",
      type: "Temporal",
      confidencePercent: 88,
      linkedSources: ["Dexcom"],
    },
    {
      id: "demo-steps-threshold",
      title: "Higher step days skew toward lower average glucose",
      description:
        "Daily step totals are compared against each day’s mean glucose: busier movement days run lower on average than sedentary ones in this window.",
      type: "Steps",
      confidencePercent: 86,
      linkedSources: ["Dexcom", "Apple Steps"],
    },
    {
      id: "demo-sessions-activity",
      title: "Distance runs show a steady glucose dip; long swims often bump it",
      description:
        "Strava runs pair with a repeatable ~30 mg/dL-class drop during the block; pool swims over ~30 minutes align with a modest rise — illustrative only.",
      type: "Sessions",
      confidencePercent: 85,
      linkedSources: ["Dexcom", "Strava"],
    },
    {
      id: "demo-temporal-weekend",
      title: "Weekend averages run higher than weekdays here",
      description:
        "Sat/Sun glucose runs slightly higher versus Mon–Fri; compare bars across a 30-day filter or use 7 days for a lighter view.",
      type: "Temporal",
      confidencePercent: 83,
      linkedSources: ["Dexcom"],
    },
  ];
  return base.filter((p) => p.confidencePercent >= threshold);
}

function buildFeatureContextForRange(
  window: PatternWindow,
  labelDays: number,
  prefs: UserPreferences,
  rangeStartYmd: string,
  rangeEndYmd: string,
): PatternFeatureContext {
  const seed = DEMO_BG_CURVE_SEED;
  const ymds = eachYmdInclusive(rangeStartYmd, rangeEndYmd);
  const stepThreshold = Math.max(5000, Math.min(prefs.targetStepsPerDay, 9000));

  const temporal = computeDemoTemporalFromDays(ymds, seed);
  const steps = computeDemoStepsStats(ymds, seed, prefs, stepThreshold);
  const sessions = computeDemoSessionStats(ymds, seed);

  const dailyMeans = ymds.map((y) => demoDailyMeanMgdl(y, seed));
  const meanMgdl = dailyMeans.length ? mean(dailyMeans) : null;
  const glucoseReadingsCount = ymds.length * 288;

  const windowHint =
    window === "7d"
      ? "7-day window: shorter trends, lighter overlay density — good for a quick check."
      : window === "30d"
        ? "30-day window: fuller story for steps, workouts, and weekday vs weekend splits."
        : "90-day window: broader context and more stable trend estimates.";

  return {
    windowDays: labelDays,
    calendarDaysInWindow: ymds.length,
    glucoseReadingsCount,
    meanMgdl,
    tirInRangePercent: 74.2,
    tirGoalPercent: prefs.targetTirPercent,
    targetLowMgdl: prefs.targetLowMgdl,
    targetHighMgdl: prefs.targetHighMgdl,
    temporal,
    steps,
    sessions,
    dataCoverage: {
      glucoseReadingsCount,
      hourlyStepBucketsCount: ymds.length * 24,
      manualWorkoutsCount: sessions.manualWorkoutCount,
      stravaActivitiesCount: sessions.stravaWorkoutCount,
      analysisHint: windowHint,
    },
    inclusion: {
      rangeStartYmd,
      rangeEndYmd,
      daysWithCgm: ymds.length,
      daysWithSteps: ymds.length,
      activitiesCount: sessions.stravaWorkoutCount + sessions.manualWorkoutCount,
    },
    evidence: {
      dailyGlucoseSteps: buildDemoDailyGlucoseSteps(ymds, seed),
      sessionDeltas: buildDemoSessionDeltaPoints(ymds, seed),
      cgmDaysSample: ymds.slice(-16),
      hourlyCurvesByDay: buildDemoHourlyCurvesForDays(ymds, seed),
    },
  };
}

export function buildDemoPatternsFeatureJson(args: {
  window: PatternWindow;
  timeZone: string;
  prefs: UserPreferences;
  startUtc: Date;
  endUtcExclusive: Date;
  labelDays: number;
}): PatternsFeatureJson {
  const { window, timeZone, prefs, startUtc, endUtcExclusive, labelDays } = args;
  const threshold = prefs.patternThresholdPercent;
  let patterns = selectPatternsForDisplay(demoPatterns(threshold));
  if (patterns.length === 0) {
    patterns = selectPatternsForDisplay(demoPatterns(15));
  }

  const rangeStartYmd = formatYmdInZone(startUtc, timeZone);
  const rangeEndYmd = formatYmdInZone(new Date(endUtcExclusive.getTime() - 1), timeZone);

  const featureContext = buildFeatureContextForRange(
    window,
    labelDays,
    prefs,
    rangeStartYmd,
    rangeEndYmd,
  );

  patterns = attachLearnMoreToPatterns(patterns, featureContext);

  return {
    window,
    range: {
      startUtc: startUtc.toISOString(),
      endUtcExclusive: endUtcExclusive.toISOString(),
      labelDays,
    },
    timeZone,
    patternThresholdPercent: threshold,
    generatedAt: new Date().toISOString(),
    source: "demo",
    patterns,
    featureContext,
  };
}
