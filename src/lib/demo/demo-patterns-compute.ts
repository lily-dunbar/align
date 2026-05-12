import "server-only";

import {
  demoGlucoseMgdlForSample,
  getDemoGlucoseDayState,
} from "@/lib/demo/demo-bg-curve";
import {
  DEMO_RUN_DIP_DEPTH,
  calendarYmdIsWeekend,
  getDemoDayProfile,
} from "@/lib/demo/demo-day-profile";
import type { GlucosePoint as TirGlucosePoint } from "@/lib/tir";
import { calculateTir } from "@/lib/tir";
import type { UserPreferences } from "@/lib/user-display-preferences";
import type {
  PatternDailyGlucoseStepsPoint,
  PatternSessionDeltaPoint,
  PatternWindow,
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

function hashInt(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function percentileFromSorted(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0]!;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! * (hi - idx) + sorted[hi]! * (idx - lo);
}

function runDeltaMgdlForDay(ymd: string, seed: string): number {
  // Tight band consistent with DEMO_RUN_DIP_DEPTH (demo aerobic dip narrative).
  const j = hashInt(`${seed}|run-delta|${ymd}`) % 9;
  return -(DEMO_RUN_DIP_DEPTH - 3 + j);
}

function swimDeltaMgdlForDay(ymd: string, seed: string): number {
  // Deterministic per day, typically a modest upward shift.
  return 14 + (hashInt(`${seed}|swim-delta|${ymd}`) % 24);
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

/** All CGM samples in the window — used for aggregate TIR / mean consistent with real stats. */
export function collectDemoWindowGlucosePoints(ymds: string[], seed: string): TirGlucosePoint[] {
  const points: TirGlucosePoint[] = [];
  let seq = 0;
  for (const ymd of ymds) {
    const isWeekend = calendarYmdIsWeekend(ymd);
    const state = getDemoGlucoseDayState(ymd, seed, isWeekend);
    for (let slot = 0; slot < 288; slot += 1) {
      const hourF = (slot * 5) / 60;
      const mgdl = demoGlucoseMgdlForSample({
        hourF,
        slotIndex: slot,
        ymd,
        seed,
        isWeekend,
        state,
      });
      seq += 1;
      points.push({
        observedAt: new Date(seq * 60_000),
        mgdl,
      });
    }
  }
  return points;
}

export function computeDemoWindowTirAndMean(
  ymds: string[],
  seed: string,
  targetLowMgdl: number,
  targetHighMgdl: number,
): { tirInRangePercent: number | null; meanMgdl: number | null } {
  const points = collectDemoWindowGlucosePoints(ymds, seed);
  if (!points.length) return { tirInRangePercent: null, meanMgdl: null };
  const tir = calculateTir(points, { targetLowMgdl, targetHighMgdl });
  const meanMgdl = Math.round(mean(points.map((p) => p.mgdl)));
  return { tirInRangePercent: tir.inRangePercent, meanMgdl };
}

/** Slight threshold skew so active vs sedentary day splits differ subtly across 7d / 30d / 90d. */
export function demoActiveStepsThresholdForWindow(
  prefs: UserPreferences,
  patternWindow: PatternWindow,
): number {
  const base = Math.max(5000, Math.min(prefs.targetStepsPerDay, 9000));
  const skew =
    patternWindow === "7d" ? -165 : patternWindow === "30d" ? 0 : 145;
  return Math.round(Math.min(11_500, Math.max(4300, base + skew)));
}

/** Circular moving average on the 24h composite curve — stronger smoothing for longer windows. */
function smoothDemoCompositeHourCurve(means: number[], patternWindow: PatternWindow): number[] {
  const taps =
    patternWindow === "7d" ? 1 : patternWindow === "30d" ? 3 : 5;
  if (taps <= 1) {
    return means.map((v) => Math.round(v));
  }
  const radius = Math.floor(taps / 2);
  const out: number[] = [];
  for (let h = 0; h < 24; h += 1) {
    let sum = 0;
    let n = 0;
    for (let k = -radius; k <= radius; k += 1) {
      const idx = (h + k + 24) % 24;
      sum += means[idx]!;
      n += 1;
    }
    out.push(Math.round(sum / n));
  }
  return out;
}

export type DemoTemporalOptions = {
  patternWindow: PatternWindow;
  eveningHighMgdlThreshold: number;
};

export function computeDemoTemporalFromDays(
  ymds: string[],
  seed: string,
  opts?: DemoTemporalOptions,
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

  let eveningHighDays = 0;
  const highTh = opts?.eveningHighMgdlThreshold;

  for (const ymd of ymds) {
    const dayHour = demoHourMeansForDay(ymd, seed);
    const dm = demoDailyMeanMgdl(ymd, seed);
    if (calendarYmdIsWeekend(ymd)) weekendMeans.push(dm);
    else weekdayMeans.push(dm);

    if (highTh != null) {
      const isWeekend = calendarYmdIsWeekend(ymd);
      const state = getDemoGlucoseDayState(ymd, seed, isWeekend);
      let dayHasEveningHigh = false;
      for (let hour = 18; hour <= 21 && !dayHasEveningHigh; hour += 1) {
        for (let k = 0; k < 12; k += 1) {
          const hourF = hour + (k * 5) / 60;
          const mgdl = demoGlucoseMgdlForSample({
            hourF,
            slotIndex: hour * 12 + k,
            ymd,
            seed,
            isWeekend,
            state,
          });
          if (mgdl > highTh) {
            dayHasEveningHigh = true;
            break;
          }
        }
      }
      if (dayHasEveningHigh) eveningHighDays += 1;
    }

    for (let h = 0; h < 24; h += 1) {
      accHour[h] += dayHour[h]!;
      cntHour[h] += 1;
    }
  }

  const rawHourMean = accHour.map((s, h) => Math.round(s / Math.max(1, cntHour[h]!)));
  const hourMeanMgdl = opts?.patternWindow
    ? smoothDemoCompositeHourCurve(rawHourMean, opts.patternWindow)
    : rawHourMean;
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
    eveningHigh630to21DaysCount: highTh != null ? eveningHighDays : Math.min(ymds.length, 10),
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

export function computeDemoSessionStats(
  ymds: string[],
  seed: string,
  patternWindow?: PatternWindow,
): SessionStats {
  const runDays = ymds.filter((y) => getDemoDayProfile(y, seed).hasDistanceRun);
  const swimDays = ymds.filter((y) => getDemoDayProfile(y, seed).hasLongSwim);
  const runDeltas = runDays.map((y) => runDeltaMgdlForDay(y, seed));
  const allSessionDeltas = [
    ...runDeltas,
    ...swimDays.map((y) => swimDeltaMgdlForDay(y, seed)),
  ];
  const avgRunDelta = runDeltas.length ? mean(runDeltas) : null;
  const sortedRun = [...runDeltas].sort((a, b) => a - b);

  const workoutReadingsPerDay =
    patternWindow === "7d"
      ? 36
      : patternWindow === "30d"
        ? 40
        : patternWindow === "90d"
          ? 44
          : 40;

  return {
    workoutStartsCount: runDays.length + swimDays.length,
    stravaWorkoutCount: runDays.length,
    manualWorkoutCount: swimDays.length,
    readingsNearWorkout2h: Math.min(ymds.length * workoutReadingsPerDay, 2400),
    readingsAwayFromWorkout2h: Math.max(200, ymds.length * 200),
    meanMgdlNearWorkout2h:
      allSessionDeltas.length > 0 ? 136 + mean(allSessionDeltas) : null,
    meanMgdlAwayFromWorkout2h: allSessionDeltas.length > 0 ? 136 : null,
    runLikeSessionsWithDelta: runDays.length,
    avgMgdlDeltaRunLike: avgRunDelta,
    avgDistanceMetersRunLike: 4 * 1609.34,
    avgDurationMinutesRunLike: 32,
    dominantRunLikeLabel: "Run",
    longRunMilesThreshold: 2,
    runLikeSessionsDeltaOverLongRunMi: runDays.length,
    avgMgdlDeltaRunLikeOverLongRunMi: avgRunDelta,
    deltaMgdlP25LongRunMi: percentileFromSorted(sortedRun, 0.25),
    deltaMgdlP75LongRunMi: percentileFromSorted(sortedRun, 0.75),
  };
}

export function buildDemoSessionDeltaPoints(
  ymds: string[],
  seed: string,
  patternWindow?: PatternWindow,
): PatternSessionDeltaPoint[] {
  const out: PatternSessionDeltaPoint[] = [];
  for (const ymd of ymds) {
    const p = getDemoDayProfile(ymd, seed);
    if (p.hasDistanceRun) {
      out.push({
        deltaMgdl: runDeltaMgdlForDay(ymd, seed),
        distanceMeters: Math.round(4.1 * 1609.34),
        label: "Afternoon run",
        startYmd: ymd,
      });
    }
    if (p.hasLongSwim) {
      out.push({
        deltaMgdl: swimDeltaMgdlForDay(ymd, seed),
        distanceMeters: null,
        label: "Pool swim (40+ min)",
        startYmd: ymd,
      });
    }
  }
  const cap =
    patternWindow === "7d"
      ? 10
      : patternWindow === "30d"
        ? 18
        : patternWindow === "90d"
          ? 24
          : 24;
  return out.slice(0, cap);
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
