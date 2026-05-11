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

function demoPatterns(threshold: number, window: PatternWindow): PatternInsightJson[] {
  const windowTag =
    window === "7d" ? "quick-view" : window === "30d" ? "balanced-view" : "long-view";
  const temporalConfidence =
    window === "7d" ? 84 : window === "30d" ? 88 : 91;
  const sessionsConfidence =
    window === "7d" ? 82 : window === "30d" ? 86 : 89;
  const stepsConfidence =
    window === "7d" ? 80 : window === "30d" ? 85 : 88;

  const base: PatternInsightJson[] = [
    {
      id: `demo-temporal-lunch-${windowTag}`,
      title:
        window === "7d"
          ? "This week, logged lunch sits near midday glucose variability"
          : window === "90d"
            ? "Over 90 days, lunch logs still track midday glucose swings"
            : "Midday glucose irregularity lines up with your lunch log time",
      description:
        "There is a correlation between when you log lunch and glucose fluctuations around midday: your meal log's local hour overlaps the part of the day when glucose tends to be most changeable on the clock. The trace can rise, flatten, or dip from day to day, and swings vary in size—use that overlap as timing context, not as proof that every lunch drives the same post-meal curve.",
      type: "Temporal",
      confidencePercent: temporalConfidence,
      linkedSources: ["Dexcom"],
    },
    {
      id: `demo-steps-threshold-${windowTag}`,
      title: "Higher step days skew toward lower average glucose",
      description:
        "Daily step totals are compared against each day’s mean glucose: busier movement days run lower on average than sedentary ones in this window.",
      type: "Steps",
      confidencePercent: stepsConfidence,
      linkedSources: ["Dexcom", "Apple Steps"],
    },
    {
      id: `demo-sessions-activity-${windowTag}`,
      title: "Distance runs often lower glucose by ~35 mg/dL",
      description:
        "In this demo view, Strava runs long enough to count as distance work tend to show glucose falling through the effort—often on the order of ~35 mg/dL versus the surrounding trace. Long pool swims (about 30+ minutes) lean the other way, with a modest rise. Illustrative sample pattern only; your own response to exercise will vary.",
      type: "Sessions",
      confidencePercent: sessionsConfidence,
      linkedSources: ["Dexcom", "Strava"],
    },
    {
      id: `demo-temporal-weekend-${windowTag}`,
      title: "Weekend averages run higher than weekdays",
      description:
        window === "7d"
          ? "In a one-week lens this can flip faster day to day; expand to 30/90 days for stability."
          : "Sat/Sun glucose runs slightly higher versus Mon–Fri; compare bars across a 30-day filter or use 7 days for a lighter view.",
      type: "Temporal",
      confidencePercent: window === "7d" ? 76 : 83,
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

  const rangeStartYmd = formatYmdInZone(startUtc, timeZone);
  const rangeEndYmd = formatYmdInZone(new Date(endUtcExclusive.getTime() - 1), timeZone);

  const featureContext = buildFeatureContextForRange(
    window,
    labelDays,
    prefs,
    rangeStartYmd,
    rangeEndYmd,
  );

  let patterns = selectPatternsForDisplay(demoPatterns(threshold, window));
  if (patterns.length === 0) {
    patterns = selectPatternsForDisplay(demoPatterns(15, window));
  }

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
