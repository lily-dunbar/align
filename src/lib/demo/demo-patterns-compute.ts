import "server-only";

import {
  demoGlucoseMgdlForSample,
  getDemoGlucoseDayState,
} from "@/lib/demo/demo-bg-curve";
import {
  calendarYmdIsWeekend,
  getDemoDayProfile,
} from "@/lib/demo/demo-day-profile";
import type { UserPreferences } from "@/lib/user-display-preferences";
import type {
  PatternDailyGlucoseStepsPoint,
  PatternSessionDeltaPoint,
  SessionStats,
  StepsStats,
  TemporalStats,
} from "@/lib/patterns/types";

/** Inclusive YYYY-MM-DD list. */
export function eachYmdInclusive(startYmd: string, endYmd: string): string[] {
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

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, x) => s + x, 0) / values.length;
}

export function demoHourMeansForDay(ymd: string, seed: string): number[] {
  const hourly: number[] = Array(24).fill(0);
  const isWeekend = calendarYmdIsWeekend(ymd);
  const state = getDemoGlucoseDayState(ymd, seed, isWeekend);
  for (let hour = 0; hour < 24; hour += 1) {
    let sum = 0;
    for (let k = 0; k < 12; k += 1) {
      const hourF = hour + (k * 5) / 60;
      sum += demoGlucoseMgdlForSample({
        hourF,
        slotIndex: hour * 12 + k,
        ymd,
        seed,
        isWeekend,
        state,
      });
    }
    hourly[hour] = sum / 12;
  }
  return hourly;
}

export function demoDailyMeanMgdl(ymd: string, seed: string): number {
  const isWeekend = calendarYmdIsWeekend(ymd);
  const state = getDemoGlucoseDayState(ymd, seed, isWeekend);
  let sum = 0;
  for (let slot = 0; slot < 288; slot += 1) {
    const hourF = (slot * 5) / 60;
    sum += demoGlucoseMgdlForSample({
      hourF,
      slotIndex: slot,
      ymd,
      seed,
      isWeekend,
      state,
    });
  }
  return sum / 288;
}

export function computeDemoTemporalFromDays(
  ymds: string[],
  seed: string,
): TemporalStats {
  if (ymds.length === 0) {
    return {
      readingsUsed: 0,
      hourMeanMgdl: Array(24).fill(null),
      hourSampleCount: Array(24).fill(0),
      peakHour: null,
      troughHour: null,
      peakMeanMgdl: null,
      troughMeanMgdl: null,
      morningMeanMgdl: null,
      afternoonMeanMgdl: null,
      eveningMeanMgdl: null,
      nightMeanMgdl: null,
      weekdayMeanMgdl: null,
      weekendMeanMgdl: null,
      weekdaySampleCount: 0,
      weekendSampleCount: 0,
      eveningHigh630to21DaysCount: 0,
      dinnerEveningMeanMgdl: null,
      dinnerEveningVsMorningDeltaMgdl: null,
    };
  }

  const accHour = Array(24).fill(0);
  const cntHour = Array(24).fill(0);
  const weekdayMeans: number[] = [];
  const weekendMeans: number[] = [];

  for (const ymd of ymds) {
    const dayHour = demoHourMeansForDay(ymd, seed);
    const dm = demoDailyMeanMgdl(ymd, seed);
    if (calendarYmdIsWeekend(ymd)) weekendMeans.push(dm);
    else weekdayMeans.push(dm);
    for (let h = 0; h < 24; h += 1) {
      accHour[h] += dayHour[h]!;
      cntHour[h] += 1;
    }
  }

  const hourMeanMgdl = accHour.map((s, h) => Math.round(s / Math.max(1, cntHour[h]!)));
  const readingsUsed = ymds.length * 288;

  let peakHour = 0;
  let troughHour = 0;
  for (let h = 1; h < 24; h += 1) {
    if (hourMeanMgdl[h]! > hourMeanMgdl[peakHour]!) peakHour = h;
    if (hourMeanMgdl[h]! < hourMeanMgdl[troughHour]!) troughHour = h;
  }

  const morningMeanMgdl = mean(hourMeanMgdl.slice(6, 12));
  const afternoonMeanMgdl = mean(hourMeanMgdl.slice(12, 18));
  const eveningMeanMgdl = mean(hourMeanMgdl.slice(18, 22));
  const nightMeanMgdl = mean([...hourMeanMgdl.slice(22, 24), ...hourMeanMgdl.slice(0, 5)]);

  return {
    readingsUsed,
    hourMeanMgdl,
    hourSampleCount: cntHour,
    peakHour,
    troughHour,
    peakMeanMgdl: hourMeanMgdl[peakHour]!,
    troughMeanMgdl: hourMeanMgdl[troughHour]!,
    morningMeanMgdl,
    afternoonMeanMgdl,
    eveningMeanMgdl,
    nightMeanMgdl,
    weekdayMeanMgdl: weekdayMeans.length ? mean(weekdayMeans) : null,
    weekendMeanMgdl: weekendMeans.length ? mean(weekendMeans) : null,
    weekdaySampleCount: weekdayMeans.length * 288,
    weekendSampleCount: weekendMeans.length * 288,
    eveningHigh630to21DaysCount: Math.min(ymds.length, 10),
    dinnerEveningMeanMgdl: eveningMeanMgdl,
    dinnerEveningVsMorningDeltaMgdl: eveningMeanMgdl - morningMeanMgdl,
  };
}

export function computeDemoStepsStats(
  ymds: string[],
  seed: string,
  prefs: UserPreferences,
  threshold: number,
): StepsStats {
  const points: PatternDailyGlucoseStepsPoint[] = ymds.map((ymd) => {
    const p = getDemoDayProfile(ymd, seed);
    return {
      ymd,
      steps: p.dailySteps,
      meanMgdl: Math.round(demoDailyMeanMgdl(ymd, seed) * 10) / 10,
    };
  });

  const withSteps = points.filter((p) => p.steps > 0);
  const high = withSteps.filter((p) => p.steps >= threshold);
  const low = withSteps.filter((p) => p.steps < threshold);

  const meanHigh = high.length ? mean(high.map((p) => p.meanMgdl)) : null;
  const meanLow = low.length ? mean(low.map((p) => p.meanMgdl)) : null;

  return {
    daysWithStepsAndGlucose: withSteps.length,
    medianDailySteps:
      withSteps.length === 0
        ? null
        : [...withSteps.map((p) => p.steps)].sort((a, b) => a - b)[
            Math.floor((withSteps.length - 1) / 2)
          ] ?? null,
    meanDailyMgdlHighStepDays: meanHigh,
    meanDailyMgdlLowStepDays: meanLow,
    daysHighStepBucket: high.length,
    daysLowStepBucket: low.length,
    avgDailySteps: withSteps.length ? mean(withSteps.map((p) => p.steps)) : null,
    stepsGoalPerDay: prefs.targetStepsPerDay,
    hasHourlyStepsData: true,
    stravaWorkoutCount: ymds.filter((y) => getDemoDayProfile(y, seed).hasDistanceRun).length,
    manualWorkoutCount: ymds.filter((y) => getDemoDayProfile(y, seed).hasLongSwim).length,
    activeDayStepsThreshold: threshold,
    daysMeanMgdlStepsGteThreshold: high.length,
    daysMeanMgdlStepsLtThreshold: low.length,
    meanDailyMgdlStepsGteThreshold: meanHigh,
    meanDailyMgdlStepsLtThreshold: meanLow,
    meanMgdlDeltaLessActiveMinusActive:
      meanLow != null && meanHigh != null ? meanLow - meanHigh : null,
  };
}

export function computeDemoSessionStats(ymds: string[], seed: string): SessionStats {
  const runDays = ymds.filter((y) => getDemoDayProfile(y, seed).hasDistanceRun);
  const swimDays = ymds.filter((y) => getDemoDayProfile(y, seed).hasLongSwim);

  return {
    workoutStartsCount: runDays.length + swimDays.length,
    stravaWorkoutCount: runDays.length,
    manualWorkoutCount: swimDays.length,
    readingsNearWorkout2h: Math.min(ymds.length * 40, 2400),
    readingsAwayFromWorkout2h: Math.max(200, ymds.length * 200),
    meanMgdlNearWorkout2h: 112,
    meanMgdlAwayFromWorkout2h: 138,
    runLikeSessionsWithDelta: runDays.length,
    avgMgdlDeltaRunLike: runDays.length ? -36 : null,
    avgDistanceMetersRunLike: 4 * 1609.34,
    avgDurationMinutesRunLike: 32,
    dominantRunLikeLabel: "Run",
    longRunMilesThreshold: 2,
    runLikeSessionsDeltaOverLongRunMi: runDays.length,
    avgMgdlDeltaRunLikeOverLongRunMi: runDays.length ? -36 : null,
    deltaMgdlP25LongRunMi: -32,
    deltaMgdlP75LongRunMi: -40,
  };
}

export function buildDemoSessionDeltaPoints(ymds: string[], seed: string): PatternSessionDeltaPoint[] {
  const out: PatternSessionDeltaPoint[] = [];
  for (const ymd of ymds) {
    const p = getDemoDayProfile(ymd, seed);
    if (p.hasDistanceRun) {
      out.push({
        deltaMgdl: -36,
        distanceMeters: Math.round(4.1 * 1609.34),
        label: "Afternoon run",
        startYmd: ymd,
      });
    }
    if (p.hasLongSwim) {
      out.push({
        deltaMgdl: 28,
        distanceMeters: null,
        label: "Pool swim (40+ min)",
        startYmd: ymd,
      });
    }
  }
  return out.slice(0, 24);
}

export function buildDemoHourlyCurvesForDays(ymds: string[], seed: string) {
  return ymds.map((ymd) => ({
    ymd,
    hourMeanMgdl: demoHourMeansForDay(ymd, seed) as (number | null)[],
  }));
}

export function buildDemoDailyGlucoseSteps(ymds: string[], seed: string): PatternDailyGlucoseStepsPoint[] {
  return ymds.map((ymd) => {
    const p = getDemoDayProfile(ymd, seed);
    return {
      ymd,
      steps: p.dailySteps,
      meanMgdl: Math.round(demoDailyMeanMgdl(ymd, seed) * 10) / 10,
    };
  });
}
