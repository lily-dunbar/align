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
    if (h >= 22 || h < 5) return 102 + (h % 3);
    if (h === 12) return 232;
    if (h === 11 || h === 13) return 188;
    if (h >= 17 && h <= 18) return 118;
    if (h >= 19 && h <= 21) return 134;
    return 114 + Math.round(Math.sin((h / 24) * Math.PI * 2) * 10);
  });
  return {
    readingsUsed: 4021,
    hourMeanMgdl,
    hourSampleCount: Array(24).fill(167),
    peakHour: 12,
    troughHour: 4,
    peakMeanMgdl: 232,
    troughMeanMgdl: 96,
    morningMeanMgdl: 118,
    afternoonMeanMgdl: 132,
    eveningMeanMgdl: 130,
    nightMeanMgdl: 102,
    weekdayMeanMgdl: 124,
    weekendMeanMgdl: 112,
    weekdaySampleCount: 2780,
    weekendSampleCount: 841,
    eveningHigh630to21DaysCount: 8,
    dinnerEveningMeanMgdl: 142,
    dinnerEveningVsMorningDeltaMgdl: 28,
  };
}

function stubSteps(prefs: UserPreferences): PatternFeatureContext["steps"] {
  return {
    daysWithStepsAndGlucose: 21,
    medianDailySteps: 8200,
    meanDailyMgdlHighStepDays: 117,
    meanDailyMgdlLowStepDays: 165,
    daysHighStepBucket: 12,
    daysLowStepBucket: 9,
    avgDailySteps: 8120,
    stepsGoalPerDay: prefs.targetStepsPerDay,
    hasHourlyStepsData: true,
    stravaWorkoutCount: 10,
    manualWorkoutCount: 2,
    activeDayStepsThreshold: 7000,
    daysMeanMgdlStepsGteThreshold: 12,
    daysMeanMgdlStepsLtThreshold: 9,
    meanDailyMgdlStepsGteThreshold: 117,
    meanDailyMgdlStepsLtThreshold: 165,
    meanMgdlDeltaLessActiveMinusActive: 48,
  };
}

/** ~4 mi — matches demo Strava afternoon runs. */
const FOUR_MILES_METERS = 4 * 1609.34;

/** Matches `stubTemporal()` shape with small per-day jitter for overlay learn-more charts. */
function demoBaselineHourMgdl(h: number): number {
  if (h >= 22 || h < 5) return 102 + (h % 3);
  if (h === 12) return 232;
  if (h === 11 || h === 13) return 188;
  if (h >= 17 && h <= 18) return 118;
  if (h >= 19 && h <= 21) return 134;
  return 114 + Math.round(Math.sin((h / 24) * Math.PI * 2) * 10);
}

function calendarYmdIsWeekend(ymd: string): boolean {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!Number.isFinite(y)) return false;
  const w = new Date(y, m - 1, d).getDay();
  return w === 0 || w === 6;
}

/** 0 Sun … 6 Sat (UTC noon anchor). */
function weekdaySun0FromYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!Number.isFinite(y)) return 0;
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

/**
 * Scatter for learn-more: aligns with `buildDemoDayApiPayload` story — Mon/Wed/Fri runs + high steps
 * and smoother means; Tue/Thu desk + higher post-lunch; weekends in between.
 */
function demoStepsAndMeanForYmd(ymd: string): { steps: number; meanMgdl: number } {
  const sun0 = weekdaySun0FromYmd(ymd);
  const salt = ymd.split("-").reduce((acc, x) => acc + Number(x), 0);
  const monWedFri = sun0 === 1 || sun0 === 3 || sun0 === 5;
  const tueThu = sun0 === 2 || sun0 === 4;

  if (monWedFri) {
    return { steps: 11300 + (salt % 7) * 120, meanMgdl: 117 + (salt % 5) * 1.6 };
  }
  if (tueThu) {
    return { steps: 4700 + (salt % 5) * 130, meanMgdl: 160 + (salt % 6) * 1.9 };
  }
  const saturday = sun0 === 6;
  return {
    steps: saturday ? 8400 + (salt % 6) * 100 : 5050 + (salt % 5) * 80,
    meanMgdl: saturday ? 128 + (salt % 5) * 1.7 : 148 + (salt % 4) * 1.6,
  };
}

/** Aligns learn-more overlays with day-view demo: weekends messier, short-sleep dawn bump. */
function demoHourlyCurvesForDays(days: string[]): PatternFeatureContext["evidence"]["hourlyCurvesByDay"] {
  return days.map((ymd, di) => {
    const salt = ymd.split("-").reduce((acc, x) => acc + Number(x), 0) + di * 7;
    const weekend = calendarYmdIsWeekend(ymd);
    const shortSleep = salt % 11 < 4;
    const chaos = (weekend ? 1.55 : 1) * (shortSleep ? 1.22 : 1);
    const hourMeanMgdl = Array.from({ length: 24 }, (_, h) => {
      let j = ((salt + h * 3) % 11) - 5;
      j = Math.round(j * chaos);
      if (weekend && h >= 9 && h <= 21) j += (salt + h * 2) % 7;
      if (shortSleep && h >= 5 && h <= 11) j += 3 + ((salt + h) % 4);
      const v = demoBaselineHourMgdl(h) + j;
      return Math.max(65, Math.min(320, Math.round(v)));
    });
    return { ymd, hourMeanMgdl };
  });
}

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

  const dailyGlucoseSteps = days.map((ymd) => {
    const { steps, meanMgdl } = demoStepsAndMeanForYmd(ymd);
    return {
      ymd,
      meanMgdl: Math.round(meanMgdl * 10) / 10,
      steps,
    };
  });

  const sessionDeltas: PatternFeatureContext["evidence"]["sessionDeltas"] = [];
  const runDays = days
    .filter((ymd) => {
      const s = weekdaySun0FromYmd(ymd);
      return s === 1 || s === 3 || s === 5;
    })
    .slice(0, 8);
  runDays.forEach((ymd, runI) => {
    sessionDeltas.push({
      deltaMgdl: Math.round((-78 - (runI % 4) * 4) * 10) / 10,
      distanceMeters: FOUR_MILES_METERS + runI * 80,
      label: `Afternoon run ${runI + 1}`,
      startYmd: ymd,
    });
  });

  return {
    dailyGlucoseSteps,
    sessionDeltas,
    cgmDaysSample,
    hourlyCurvesByDay: demoHourlyCurvesForDays(days),
  };
}

function stubSessions(): PatternFeatureContext["sessions"] {
  return {
    workoutStartsCount: 12,
    stravaWorkoutCount: 10,
    manualWorkoutCount: 2,
    readingsNearWorkout2h: 920,
    readingsAwayFromWorkout2h: 3100,
    meanMgdlNearWorkout2h: 108,
    meanMgdlAwayFromWorkout2h: 124,
    runLikeSessionsWithDelta: 8,
    avgMgdlDeltaRunLike: -78,
    avgDistanceMetersRunLike: FOUR_MILES_METERS,
    avgDurationMinutesRunLike: 52,
    dominantRunLikeLabel: "Run",
    longRunMilesThreshold: 2,
    runLikeSessionsDeltaOverLongRunMi: 8,
    avgMgdlDeltaRunLikeOverLongRunMi: -78,
    deltaMgdlP25LongRunMi: -72,
    deltaMgdlP75LongRunMi: -88,
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
    meanMgdl: 124,
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
      manualWorkoutsCount: 2,
      stravaActivitiesCount: 10,
      analysisHint:
        "Demo window — Home uses one scripted day shape (morning ramp, noon spike, afternoon plateau, evening run dip, night rebound); Patterns stitches multiple calendar days with light variation — compare day picker vs Patterns scatter.",
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
      hourlyCurvesByDay: [],
    },
  };
}

function demoPatterns(threshold: number): PatternInsightJson[] {
  const base: PatternInsightJson[] = [
    {
      id: "demo-temporal-lunch",
      title: "Sharp climb around noon, often peaking near 250 mg/dL",
      description:
        "Dexcom by hour-of-day shows your clearest bump in this demo right after the noon fast-acting meal log, with the CGM crest between 12:00 and 12:30 inside the one-hour absorption window — think carbs, timing, or prebolus; align with food logs and your care team.",
      type: "Temporal",
      confidencePercent: 88,
      linkedSources: ["Dexcom"],
    },
    {
      id: "demo-steps-threshold",
      title: "Often ~48 mg/dL lower on days over ~7,000 steps",
      description:
        "Demo data stacks Mon/Wed/Fri’s run + commute against Tue/Thu desk days: averages fall on high-step days while post-lunch glide stays higher when movement is light. Real data will differ — this shows how Align links steps and CGM.",
      type: "Steps",
      confidencePercent: 82,
      linkedSources: ["Dexcom", "Apple Steps"],
    },
    {
      id: "demo-sessions-longrun",
      title: "Large BG drop on ~4 mi afternoon runs",
      description:
        "Strava-linked runs (~50 min, ~4 mi) pair with Dexcom drops of about 72–88 mg/dL in-window (workout vs pre-start). Fueling and IOB matter — use as a pattern preview, not medical advice.",
      type: "Sessions",
      confidencePercent: 84,
      linkedSources: ["Dexcom", "Strava"],
    },
    {
      id: "demo-temporal-weekday",
      title: "Runs ~12 mg/dL higher on weekdays than weekends",
      description:
        "Weekday work rhythm (steps, lunch out, stress) pushes averages up vs lighter weekends in this stitched window. More days will show whether it sticks.",
      type: "Temporal",
      confidencePercent: 72,
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
