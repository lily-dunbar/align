import "server-only";

import { and, asc, eq, gte, lt } from "drizzle-orm";

import { db } from "@/db";
import {
  activities,
  glucoseReadings,
  hourlySteps,
  manualWorkouts,
} from "@/db/schema";
import {
  formatYmdInZone,
  isWeekendInZone,
  localHourH23,
} from "@/lib/patterns/format-ymd";
import type {
  PatternFeatureContext,
  PatternWindow,
  SessionStats,
  StepsStats,
  TemporalStats,
} from "@/lib/patterns/types";
import { windowLabelDays } from "@/lib/patterns/window";
import { calculateTir, type GlucosePoint } from "@/lib/tir";
import type { UserPreferences } from "@/lib/user-display-preferences";

const MIN_SAMPLES_PER_HOUR = 2;
const MIN_NEAR_AWAY_EACH = 5;
const MIN_DAYS_FOR_STEP_SPLIT = 4;
const WORKOUT_PROXIMITY_MS = 2 * 60 * 60 * 1000;
const BEFORE_WINDOW_MS = 90 * 60 * 1000;
const MINPTS_BEFORE_AFTER = 2;

function mean(numbers: number[]): number | null {
  if (!numbers.length) return null;
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

function bandMeanMgdl(
  points: GlucosePoint[],
  timeZone: string,
  hourInBand: (h: number) => boolean,
  minSamples: number,
): number | null {
  const vals = points
    .filter((p) => hourInBand(localHourH23(p.observedAt, timeZone)))
    .map((p) => p.mgdl);
  return vals.length >= minSamples ? mean(vals) : null;
}

function isRunLikeStrava(a: {
  sportType: string | null;
  activityType: string | null;
}): boolean {
  const s = `${a.sportType ?? ""} ${a.activityType ?? ""}`.toLowerCase();
  return /run|walk|ride|bike|hike|trail|swim|row|ski|virtual|workout|jog/.test(s);
}

function isRunLikeManual(workoutType: string): boolean {
  const s = workoutType.toLowerCase();
  if (!s.trim()) return true;
  return /run|walk|ride|bike|hike|cardio|sport|swim|elliptical|strength|yoga|rowing/.test(s);
}

function duringWindowEnd(start: Date, movingTimeSec: number | null): Date {
  const durMs =
    movingTimeSec != null && movingTimeSec >= 120
      ? movingTimeSec * 1000
      : 45 * 60 * 1000;
  const capped = Math.min(durMs + 15 * 60 * 1000, 3 * 60 * 60 * 1000);
  return new Date(start.getTime() + capped);
}

export async function loadPatternFeatureContext(
  userId: string,
  window: PatternWindow,
  startUtc: Date,
  endUtcExclusive: Date,
  timeZone: string,
  prefs: UserPreferences,
): Promise<PatternFeatureContext> {
  const labelDays = windowLabelDays(window);

  const [glucoseRows, stepRows, manualList, stravaList] = await Promise.all([
    db.query.glucoseReadings.findMany({
      where: and(
        eq(glucoseReadings.userId, userId),
        gte(glucoseReadings.observedAt, startUtc),
        lt(glucoseReadings.observedAt, endUtcExclusive),
      ),
      orderBy: [asc(glucoseReadings.observedAt)],
      columns: { observedAt: true, mgdl: true },
    }),
    db.query.hourlySteps.findMany({
      where: and(
        eq(hourlySteps.userId, userId),
        gte(hourlySteps.bucketStart, startUtc),
        lt(hourlySteps.bucketStart, endUtcExclusive),
      ),
      orderBy: [asc(hourlySteps.bucketStart)],
      columns: { bucketStart: true, stepCount: true },
    }),
    db.query.manualWorkouts.findMany({
      where: and(
        eq(manualWorkouts.userId, userId),
        gte(manualWorkouts.startedAt, startUtc),
        lt(manualWorkouts.startedAt, endUtcExclusive),
      ),
      columns: {
        startedAt: true,
        workoutType: true,
        durationMin: true,
        distanceMeters: true,
      },
    }),
    db.query.activities.findMany({
      where: and(
        eq(activities.userId, userId),
        eq(activities.provider, "strava"),
        gte(activities.startAt, startUtc),
        lt(activities.startAt, endUtcExclusive),
      ),
      columns: {
        startAt: true,
        movingTimeSec: true,
        elapsedTimeSec: true,
        distanceMeters: true,
        activityType: true,
        sportType: true,
      },
    }),
  ]);

  const glucosePoints: GlucosePoint[] = glucoseRows.map((r) => ({
    observedAt: r.observedAt,
    mgdl: r.mgdl,
  }));

  let tirInRangePercent: number | null = null;
  let meanMgdl: number | null = null;
  if (glucosePoints.length > 0) {
    const tir = calculateTir(glucosePoints, {
      targetLowMgdl: prefs.targetLowMgdl,
      targetHighMgdl: prefs.targetHighMgdl,
    });
    tirInRangePercent = tir.inRangePercent;
    meanMgdl = mean(glucosePoints.map((p) => p.mgdl));
  }

  const weekdayMgdl: number[] = [];
  const weekendMgdl: number[] = [];
  for (const p of glucosePoints) {
    if (isWeekendInZone(p.observedAt, timeZone)) weekendMgdl.push(p.mgdl);
    else weekdayMgdl.push(p.mgdl);
  }
  const weekdayMeanMgdl =
    weekdayMgdl.length >= 8 ? mean(weekdayMgdl) : null;
  const weekendMeanMgdl =
    weekendMgdl.length >= 6 ? mean(weekendMgdl) : null;

  const eveningHighDays = new Set<string>();
  for (const p of glucosePoints) {
    const h = localHourH23(p.observedAt, timeZone);
    if (h >= 18 && h <= 21 && p.mgdl > prefs.targetHighMgdl) {
      eveningHighDays.add(formatYmdInZone(p.observedAt, timeZone));
    }
  }

  const hourBuckets: number[][] = Array.from({ length: 24 }, () => []);
  for (const p of glucosePoints) {
    const h = localHourH23(p.observedAt, timeZone);
    hourBuckets[h].push(p.mgdl);
  }

  const hourMeanMgdl: (number | null)[] = hourBuckets.map((vals) =>
    vals.length >= MIN_SAMPLES_PER_HOUR ? mean(vals) : null,
  );
  const hourSampleCount = hourBuckets.map((v) => v.length);

  let peakHour: number | null = null;
  let troughHour: number | null = null;
  let peakMeanMgdl: number | null = null;
  let troughMeanMgdl: number | null = null;
  for (let h = 0; h < 24; h += 1) {
    const m = hourMeanMgdl[h];
    if (m == null) continue;
    if (peakMeanMgdl == null || m > peakMeanMgdl) {
      peakMeanMgdl = m;
      peakHour = h;
    }
    if (troughMeanMgdl == null || m < troughMeanMgdl) {
      troughMeanMgdl = m;
      troughHour = h;
    }
  }

  const temporal: TemporalStats = {
    readingsUsed: glucosePoints.length,
    hourMeanMgdl,
    hourSampleCount,
    peakHour,
    troughHour,
    peakMeanMgdl,
    troughMeanMgdl,
    morningMeanMgdl: bandMeanMgdl(
      glucosePoints,
      timeZone,
      (h) => h >= 6 && h <= 11,
      6,
    ),
    afternoonMeanMgdl: bandMeanMgdl(
      glucosePoints,
      timeZone,
      (h) => h >= 12 && h <= 17,
      6,
    ),
    eveningMeanMgdl: bandMeanMgdl(
      glucosePoints,
      timeZone,
      (h) => h >= 18 && h <= 23,
      6,
    ),
    nightMeanMgdl: bandMeanMgdl(
      glucosePoints,
      timeZone,
      (h) => h >= 0 && h <= 5,
      4,
    ),
    weekdayMeanMgdl,
    weekendMeanMgdl,
    weekdaySampleCount: weekdayMgdl.length,
    weekendSampleCount: weekendMgdl.length,
    eveningHigh630to21DaysCount: eveningHighDays.size,
  };

  const stepsByDay = new Map<string, number>();
  for (const row of stepRows) {
    const ymd = formatYmdInZone(row.bucketStart, timeZone);
    stepsByDay.set(ymd, (stepsByDay.get(ymd) ?? 0) + row.stepCount);
  }

  const glucoseByDay = new Map<string, number[]>();
  for (const p of glucosePoints) {
    const ymd = formatYmdInZone(p.observedAt, timeZone);
    if (!glucoseByDay.has(ymd)) glucoseByDay.set(ymd, []);
    glucoseByDay.get(ymd)!.push(p.mgdl);
  }

  type DayRow = { ymd: string; steps: number; meanMgdl: number };
  const dayRows: DayRow[] = [];
  for (const [ymd, steps] of stepsByDay) {
    const g = glucoseByDay.get(ymd);
    if (!g || g.length < 2) continue;
    const dm = mean(g);
    if (dm == null) continue;
    dayRows.push({ ymd, steps, meanMgdl: dm });
  }
  dayRows.sort((a, b) => a.steps - b.steps);

  let medianDailySteps: number | null = null;
  let meanDailyMgdlHighStepDays: number | null = null;
  let meanDailyMgdlLowStepDays: number | null = null;
  let daysHighStepBucket = 0;
  let daysLowStepBucket = 0;

  if (dayRows.length >= MIN_DAYS_FOR_STEP_SPLIT) {
    const mid = Math.floor(dayRows.length / 2);
    const lowDays = dayRows.slice(0, mid);
    const highDays = dayRows.slice(mid);
    daysLowStepBucket = lowDays.length;
    daysHighStepBucket = highDays.length;
    medianDailySteps =
      dayRows.length % 2 === 0
        ? (dayRows[mid - 1]!.steps + dayRows[mid]!.steps) / 2
        : dayRows[mid]!.steps;
    const lowMeans = lowDays.map((d) => d.meanMgdl);
    const highMeans = highDays.map((d) => d.meanMgdl);
    meanDailyMgdlLowStepDays = mean(lowMeans);
    meanDailyMgdlHighStepDays = mean(highMeans);
  }

  const dailyTotals = [...stepsByDay.values()];
  const avgDailySteps = dailyTotals.length
    ? Math.round(mean(dailyTotals)!)
    : null;

  const workoutStarts: Date[] = [
    ...manualList.map((m) => m.startedAt),
    ...stravaList.map((a) => a.startAt),
  ];

  const nearMgdl: number[] = [];
  const awayMgdl: number[] = [];
  if (workoutStarts.length > 0) {
    for (const p of glucosePoints) {
      const t = p.observedAt.getTime();
      const near = workoutStarts.some(
        (s) => Math.abs(t - s.getTime()) <= WORKOUT_PROXIMITY_MS,
      );
      if (near) nearMgdl.push(p.mgdl);
      else awayMgdl.push(p.mgdl);
    }
  }

  let meanMgdlNearWorkout2h: number | null = null;
  let meanMgdlAwayFromWorkout2h: number | null = null;
  if (workoutStarts.length > 0) {
    if (nearMgdl.length >= MIN_NEAR_AWAY_EACH) {
      meanMgdlNearWorkout2h = mean(nearMgdl);
    }
    if (awayMgdl.length >= MIN_NEAR_AWAY_EACH) {
      meanMgdlAwayFromWorkout2h = mean(awayMgdl);
    }
  }

  type DeltaRow = {
    delta: number;
    distanceMeters: number | null;
    durationMin: number | null;
    label: string;
  };
  const deltaRows: DeltaRow[] = [];

  for (const a of stravaList) {
    if (!isRunLikeStrava(a)) continue;
    const moving =
      a.movingTimeSec ?? a.elapsedTimeSec ?? null;
    const d0 = a.startAt;
    const d1 = duringWindowEnd(d0, moving);
    const b0 = new Date(d0.getTime() - BEFORE_WINDOW_MS);
    const b1 = d0;
    const beforePts = glucosePoints
      .filter((p) => p.observedAt >= b0 && p.observedAt < b1)
      .map((p) => p.mgdl);
    const duringPts = glucosePoints
      .filter((p) => p.observedAt >= d0 && p.observedAt < d1)
      .map((p) => p.mgdl);
    if (
      beforePts.length < MINPTS_BEFORE_AFTER ||
      duringPts.length < MINPTS_BEFORE_AFTER
    )
      continue;
    const mb = mean(beforePts)!;
    const md = mean(duringPts)!;
    deltaRows.push({
      delta: md - mb,
      distanceMeters: a.distanceMeters,
      durationMin: moving != null ? moving / 60 : null,
      label: a.sportType ?? a.activityType ?? "Workout",
    });
  }

  for (const m of manualList) {
    if (!isRunLikeManual(m.workoutType)) continue;
    const durSec =
      m.durationMin != null ? Math.round(m.durationMin * 60) : null;
    const d0 = m.startedAt;
    const d1 = duringWindowEnd(d0, durSec);
    const b0 = new Date(d0.getTime() - BEFORE_WINDOW_MS);
    const b1 = d0;
    const beforePts = glucosePoints
      .filter((p) => p.observedAt >= b0 && p.observedAt < b1)
      .map((p) => p.mgdl);
    const duringPts = glucosePoints
      .filter((p) => p.observedAt >= d0 && p.observedAt < d1)
      .map((p) => p.mgdl);
    if (
      beforePts.length < MINPTS_BEFORE_AFTER ||
      duringPts.length < MINPTS_BEFORE_AFTER
    )
      continue;
    const mb = mean(beforePts)!;
    const md = mean(duringPts)!;
    deltaRows.push({
      delta: md - mb,
      distanceMeters: m.distanceMeters,
      durationMin: m.durationMin,
      label: m.workoutType,
    });
  }

  let avgMgdlDeltaRunLike: number | null = null;
  let avgDistanceMetersRunLike: number | null = null;
  let avgDurationMinutesRunLike: number | null = null;
  let dominantRunLikeLabel: string | null = null;

  if (deltaRows.length > 0) {
    avgMgdlDeltaRunLike = mean(deltaRows.map((r) => r.delta));
    const withDist = deltaRows.filter((r) => r.distanceMeters != null && r.distanceMeters > 0);
    if (withDist.length > 0) {
      avgDistanceMetersRunLike = mean(
        withDist.map((r) => r.distanceMeters!),
      );
    }
    const withDur = deltaRows.filter((r) => r.durationMin != null);
    if (withDur.length > 0) {
      avgDurationMinutesRunLike = mean(
        withDur.map((r) => r.durationMin!),
      );
    }
    const labels = deltaRows.map((r) => r.label.toLowerCase());
    const runish = labels.filter((l) => l.includes("run")).length;
    dominantRunLikeLabel =
      runish >= deltaRows.length / 2 ? "Run" : deltaRows[0]!.label;
  }

  const steps: StepsStats = {
    daysWithStepsAndGlucose: dayRows.length,
    medianDailySteps,
    meanDailyMgdlHighStepDays,
    meanDailyMgdlLowStepDays,
    daysHighStepBucket,
    daysLowStepBucket,
    avgDailySteps,
    stepsGoalPerDay: prefs.targetStepsPerDay,
    hasHourlyStepsData: stepRows.length > 0,
    stravaWorkoutCount: stravaList.length,
    manualWorkoutCount: manualList.length,
  };

  const sessions: SessionStats = {
    workoutStartsCount: workoutStarts.length,
    stravaWorkoutCount: stravaList.length,
    manualWorkoutCount: manualList.length,
    readingsNearWorkout2h: nearMgdl.length,
    readingsAwayFromWorkout2h: awayMgdl.length,
    meanMgdlNearWorkout2h,
    meanMgdlAwayFromWorkout2h,
    runLikeSessionsWithDelta: deltaRows.length,
    avgMgdlDeltaRunLike,
    avgDistanceMetersRunLike,
    avgDurationMinutesRunLike,
    dominantRunLikeLabel,
  };

  const dataCoverage = {
    glucoseReadingsCount: glucoseRows.length,
    hourlyStepBucketsCount: stepRows.length,
    manualWorkoutsCount: manualList.length,
    stravaActivitiesCount: stravaList.length,
    analysisHint:
      "Review ALL of: (1) temporal.* — CGM vs time-of-day and weekday/weekend; (2) steps.* — hourly/daily step totals vs glucose (high- vs low-step days); (3) sessions.* — manual + Strava workouts vs CGM (near workout vs away, before/during deltas). Derive insights by comparing these domains. Use Temporal / Steps / Sessions types accordingly.",
  };

  return {
    windowDays: labelDays,
    calendarDaysInWindow: Math.max(1, labelDays),
    glucoseReadingsCount: glucoseRows.length,
    meanMgdl,
    tirInRangePercent,
    tirGoalPercent: prefs.targetTirPercent,
    targetLowMgdl: prefs.targetLowMgdl,
    targetHighMgdl: prefs.targetHighMgdl,
    temporal,
    steps,
    sessions,
    dataCoverage,
  };
}
