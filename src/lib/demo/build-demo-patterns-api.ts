import "server-only";

import { DEMO_BG_CURVE_SEED } from "@/lib/demo/demo-bg-curve";
import { formatLocalHour12 } from "@/lib/format-local-hour";
import {
  buildDemoDailyGlucoseSteps,
  buildDemoHourlyCurvesForDays,
  buildDemoSessionDeltaPoints,
  computeDemoSessionStats,
  computeDemoStepsStats,
  computeDemoTemporalFromDays,
  computeDemoWindowTirAndMean,
  demoActiveStepsThresholdForWindow,
  eachYmdInclusive,
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

function demoPatterns(
  threshold: number,
  window: PatternWindow,
  featureContext: PatternFeatureContext,
): PatternInsightJson[] {
  const windowTag =
    window === "7d" ? "quick-view" : window === "30d" ? "balanced-view" : "long-view";
  const temporal = featureContext.temporal;
  const steps = featureContext.steps;
  const sessions = featureContext.sessions;
  const weekendDelta =
    temporal.weekendMeanMgdl != null && temporal.weekdayMeanMgdl != null
      ? temporal.weekendMeanMgdl - temporal.weekdayMeanMgdl
      : null;
  const stepsDelta = steps.meanMgdlDeltaLessActiveMinusActive;
  const runDelta = sessions.avgMgdlDeltaRunLike;

  const temporalConfidence = window === "7d" ? 79 : window === "30d" ? 86 : 90;
  const sessionsConfidence = window === "7d" ? 77 : window === "30d" ? 84 : 88;
  const stepsConfidence = window === "7d" ? 76 : window === "30d" ? 83 : 87;

  const base: PatternInsightJson[] = [
    {
      id: `demo-temporal-lunch-${windowTag}`,
      title: "Midday remains the highest-variability glucose window",
      description:
        `In this ${featureContext.windowDays}-day window, the peak hourly mean sits around ${formatLocalHour12(temporal.peakHour ?? 13)} with a larger lunch-period rise than morning. That shape is consistent with mixed meal size and insulin timing variability rather than one identical response every day.`,
      type: "Temporal",
      confidencePercent: temporalConfidence,
      linkedSources: ["Dexcom"],
    },
    {
      id: `demo-steps-threshold-${windowTag}`,
      title: "Higher-step days run lower average glucose",
      description:
        stepsDelta != null
          ? `Days at or above ${steps.activeDayStepsThreshold.toLocaleString()} steps average about ${Math.abs(stepsDelta).toFixed(1)} mg/dL lower glucose than less-active days, with ${steps.daysHighStepBucket} active vs ${steps.daysLowStepBucket} lower-step days represented.`
          : "Daily step totals trend with lower mean glucose on more active days in this period.",
      type: "Steps",
      confidencePercent: stepsConfidence,
      linkedSources: ["Dexcom", "Apple Steps"],
    },
    {
      id: `demo-sessions-activity-${windowTag}`,
      title: "Run sessions usually show downward glucose drift",
      description:
        runDelta != null
          ? `Run-like sessions show an average glucose delta near ${runDelta.toFixed(1)} mg/dL over the session window, while non-run sessions are flatter to mildly rising. This mirrors common Type 1 patterns where aerobic effort increases insulin sensitivity.`
          : "When run sessions are present, glucose generally trends downward during and shortly after aerobic activity.",
      type: "Sessions",
      confidencePercent: sessionsConfidence,
      linkedSources: ["Dexcom", "Strava"],
    },
    {
      id: `demo-temporal-weekend-${windowTag}`,
      title: "Weekends trend slightly higher than weekdays",
      description:
        weekendDelta == null
          ? "Weekend vs weekday separation is visible but modest in this time window."
          : `Weekend mean glucose is about ${weekendDelta.toFixed(1)} mg/dL ${
              weekendDelta >= 0 ? "higher" : "lower"
            } than weekdays, consistent with less predictable meal timing and activity cadence.`,
      type: "Temporal",
      confidencePercent: window === "7d" ? 72 : 82,
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
  const stepThreshold = demoActiveStepsThresholdForWindow(prefs, window);

  const temporal = computeDemoTemporalFromDays(ymds, seed, {
    patternWindow: window,
    eveningHighMgdlThreshold: prefs.targetHighMgdl,
  });
  const steps = computeDemoStepsStats(ymds, seed, prefs, stepThreshold);
  const sessions = computeDemoSessionStats(ymds, seed, window);

  const { tirInRangePercent, meanMgdl } = computeDemoWindowTirAndMean(
    ymds,
    seed,
    prefs.targetLowMgdl,
    prefs.targetHighMgdl,
  );
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
    tirInRangePercent,
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
      sessionDeltas: buildDemoSessionDeltaPoints(ymds, seed, window),
      cgmDaysSample:
        window === "7d"
          ? ymds.slice(-7)
          : window === "30d"
            ? ymds.slice(-12)
            : ymds.slice(-16),
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

  let patterns = selectPatternsForDisplay(demoPatterns(threshold, window, featureContext));
  if (patterns.length === 0) {
    patterns = selectPatternsForDisplay(demoPatterns(15, window, featureContext));
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
