import "server-only";

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

function stubTemporal(): PatternFeatureContext["temporal"] {
  const hourMeanMgdl = Array.from({ length: 24 }, (_, h) => {
    if (h >= 22 || h < 5) return 98 + (h % 4);
    if (h >= 17) return 124 + Math.round((h - 17) * 1.4);
    return 108 + Math.round(Math.sin((h / 24) * Math.PI * 2) * 18);
  });
  return {
    readingsUsed: 4021,
    hourMeanMgdl,
    hourSampleCount: Array(24).fill(167),
    peakHour: 20,
    troughHour: 3,
    peakMeanMgdl: 156,
    troughMeanMgdl: 94,
    morningMeanMgdl: 112,
    afternoonMeanMgdl: 118,
    eveningMeanMgdl: 136,
    nightMeanMgdl: 99,
    weekdayMeanMgdl: 116,
    weekendMeanMgdl: 109,
    weekdaySampleCount: 2780,
    weekendSampleCount: 1241,
    eveningHigh630to21DaysCount: 5,
    dinnerEveningMeanMgdl: 136,
    dinnerEveningVsMorningDeltaMgdl: 24,
  };
}

function stubSteps(prefs: UserPreferences): PatternFeatureContext["steps"] {
  return {
    daysWithStepsAndGlucose: 19,
    medianDailySteps: 9200,
    meanDailyMgdlHighStepDays: 118,
    meanDailyMgdlLowStepDays: 112,
    daysHighStepBucket: 10,
    daysLowStepBucket: 9,
    avgDailySteps: 9050,
    stepsGoalPerDay: prefs.targetStepsPerDay,
    hasHourlyStepsData: true,
    stravaWorkoutCount: 8,
    manualWorkoutCount: 3,
    activeDayStepsThreshold: 7000,
    daysMeanMgdlStepsGteThreshold: 9,
    daysMeanMgdlStepsLtThreshold: 10,
    meanDailyMgdlStepsGteThreshold: 108,
    meanDailyMgdlStepsLtThreshold: 156,
    meanMgdlDeltaLessActiveMinusActive: 48,
  };
}

const LONG_RUN_METERS_DEMO = 2 * 1609.34;

/** Inclusive calendar-day list between two `YYYY-MM-DD` strings. */
function eachYmdInclusive(startYmd: string, endYmd: string): string[] {
  const [ys, ms, ds] = startYmd.split("-").map(Number);
  const [ye, me, de] = endYmd.split("-").map(Number);
  const out: string[] = [];
  const d = new Date(ys, ms - 1, ds);
  const end = new Date(ye, me - 1, de);
  while (d <= end) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${day}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function demoEvidence(rangeStartYmd: string, rangeEndYmd: string): PatternFeatureContext["evidence"] {
  const days = eachYmdInclusive(rangeStartYmd, rangeEndYmd);
  const cgmDaysSample = [...days];

  const dailyGlucoseSteps = days.map((ymd, i) => {
    const highStep = i % 2 === 0;
    const steps = highStep ? 9200 + (i % 5) * 120 : 4200 + (i % 4) * 180;
    const meanMgdl = highStep ? 108 + (i % 3) * 2 : 148 + (i % 4) * 2.5;
    return {
      ymd,
      meanMgdl: Math.round(meanMgdl * 10) / 10,
      steps,
    };
  });

  const sessionDeltas: PatternFeatureContext["evidence"]["sessionDeltas"] = [];
  const runDays = days.filter((_, i) => i % 3 === 0).slice(0, 6);
  runDays.forEach((ymd, runI) => {
    sessionDeltas.push({
      deltaMgdl: Math.round((-52 - (runI % 3) * 5) * 10) / 10,
      distanceMeters: LONG_RUN_METERS_DEMO + 400 + runI * 180,
      label: `Run ${runI + 1}`,
      startYmd: ymd,
    });
  });

  return { dailyGlucoseSteps, sessionDeltas, cgmDaysSample };
}

function stubSessions(): PatternFeatureContext["sessions"] {
  return {
    workoutStartsCount: 11,
    stravaWorkoutCount: 8,
    manualWorkoutCount: 3,
    readingsNearWorkout2h: 840,
    readingsAwayFromWorkout2h: 3180,
    meanMgdlNearWorkout2h: 112,
    meanMgdlAwayFromWorkout2h: 122,
    runLikeSessionsWithDelta: 6,
    avgMgdlDeltaRunLike: -14,
    avgDistanceMetersRunLike: 5200,
    avgDurationMinutesRunLike: 41,
    dominantRunLikeLabel: "Run",
    longRunMilesThreshold: 2,
    runLikeSessionsDeltaOverLongRunMi: 4,
    avgMgdlDeltaRunLikeOverLongRunMi: -58,
    deltaMgdlP25LongRunMi: -50,
    deltaMgdlP75LongRunMi: -66,
  };
}

function stubFeatureContext(
  window: PatternWindow,
  labelDays: number,
  prefs: UserPreferences,
): PatternFeatureContext {
  return {
    windowDays: labelDays,
    calendarDaysInWindow: labelDays,
    glucoseReadingsCount: 4021,
    meanMgdl: 116,
    tirInRangePercent: 76.4,
    tirGoalPercent: prefs.targetTirPercent,
    targetLowMgdl: prefs.targetLowMgdl,
    targetHighMgdl: prefs.targetHighMgdl,
    temporal: stubTemporal(),
    steps: stubSteps(prefs),
    sessions: stubSessions(),
    dataCoverage: {
      glucoseReadingsCount: 4021,
      hourlyStepBucketsCount: 504,
      manualWorkoutsCount: 3,
      stravaActivitiesCount: 8,
      analysisHint:
        "Demo — use quantified Temporal (6–9pm vs morning), Steps (≥7k day totals), Sessions (≥2 mi run deltas) when present.",
    },
    inclusion: {
      rangeStartYmd: "2026-01-01",
      rangeEndYmd: "2026-01-07",
      daysWithCgm: 0,
      daysWithSteps: 0,
      activitiesCount: 0,
    },
    evidence: {
      dailyGlucoseSteps: [],
      sessionDeltas: [],
      cgmDaysSample: [],
    },
  };
}

function demoPatterns(threshold: number): PatternInsightJson[] {
  const base: PatternInsightJson[] = [
    {
      id: "demo-temporal-dinner",
      title: "Often ~24 mg/dL higher between 6–9pm than mornings",
      description:
        "Evening glucose from Dexcom averages about two dozen mg/dL above your morning slice in this sample window — dinner timing or basal patterns may be involved; confirm with your clinician.",
      type: "Temporal",
      confidencePercent: 86,
      linkedSources: ["Dexcom"],
    },
    {
      id: "demo-steps-threshold",
      title: "Often ~48 mg/dL lower on days over 7,000 steps",
      description:
        "Mean daily glucose runs lower on higher-step days than on quieter days here — movement, meals, and sleep all differ; use this as a conversation starter, not a rule.",
      type: "Steps",
      confidencePercent: 80,
      linkedSources: ["Dexcom", "Apple Steps"],
    },
    {
      id: "demo-sessions-longrun",
      title: "Large BG drop on runs",
      description:
        "Blood sugars tend to drop by about 50–66 mg/dL on runs over 2 mi in this demo window (Dexcom during the workout vs roughly the 90 minutes before start). Fueling and adrenaline matter; compare with your own logs and clinician if needed.",
      type: "Sessions",
      confidencePercent: 82,
      linkedSources: ["Dexcom", "Strava"],
    },
    {
      id: "demo-temporal-weekday",
      title: "Runs ~7 mg/dL higher on weekdays than weekends",
      description:
        "Weekday averages edge higher — routine or stress may contribute. A longer window tightens whether this holds.",
      type: "Temporal",
      confidencePercent: 71,
      linkedSources: ["Dexcom"],
    },
  ];
  return base.filter((p) => p.confidencePercent >= threshold);
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
  const baseContext = stubFeatureContext(window, labelDays, prefs);
  const featureContext: PatternFeatureContext = {
    ...baseContext,
    inclusion: {
      rangeStartYmd,
      rangeEndYmd,
      daysWithCgm: Math.min(labelDays, 28),
      daysWithSteps: Math.min(labelDays, 26),
      activitiesCount: baseContext.sessions.manualWorkoutCount + baseContext.sessions.stravaWorkoutCount,
    },
    evidence: demoEvidence(rangeStartYmd, rangeEndYmd),
  };

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
