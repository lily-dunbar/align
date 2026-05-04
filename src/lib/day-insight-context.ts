import "server-only";

import { and, asc, eq, gte, lt } from "drizzle-orm";

import { db } from "@/db";
import {
  activities,
  foodEntries,
  glucoseReadings,
  hourlySteps,
  manualWorkouts,
  sleepWindows,
} from "@/db/schema";
import { dayBoundsUtcForYmd, todayBoundsUtc } from "@/lib/day-bounds";
import { mergeHourlyStepsPreferShortcutsFile } from "@/lib/merge-hourly-steps-sources";
import { calculateTir } from "@/lib/tir";
import { getUserPreferences } from "@/lib/user-display-preferences";

function overlapMs(
  aStart: Date,
  aEndExclusive: Date,
  bStart: Date,
  bEndExclusive: Date,
) {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEndExclusive.getTime(), bEndExclusive.getTime());
  return Math.max(0, end - start);
}

function localClockHourFromDate(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  return Number(parts.find((p) => p.type === "hour")?.value ?? "0");
}

/** Compact, token-friendly snapshot of one calendar day for Claude day insights. */
export type DayInsightSnapshot = {
  dateYmd: string | null;
  timeZone: string;
  targets: {
    lowMgdl: number;
    highMgdl: number;
    tirGoalPercent: number;
    stepsGoalPerDay: number;
  };
  aggregates: {
    tirInRangePercent: number;
    avgGlucoseMgdl: number | null;
    glucoseReadingsCount: number;
    glucoseMinMgdl: number | null;
    glucoseMaxMgdl: number | null;
    totalSteps: number;
    manualWorkoutsCount: number;
    stravaActivitiesCount: number;
    stravaDistanceKm: number;
    foodEntriesCount: number;
    foodCarbsGrams: number;
    sleepMinutes: number;
  };
  /** Steps summed by local clock hour 0–23 for this day view. */
  hourlyStepsByLocalHour: number[];
};

export async function loadDayInsightSnapshot(
  userId: string,
  dateYmd: string | null,
  timeZone: string,
): Promise<DayInsightSnapshot> {
  const prefs = await getUserPreferences(userId);
  const targetLowMgdl = prefs.targetLowMgdl;
  const targetHighMgdl = prefs.targetHighMgdl;

  const bounds = dateYmd
    ? dayBoundsUtcForYmd(dateYmd, timeZone)
    : todayBoundsUtc(timeZone);
  const { startUtc, endUtcExclusive } = bounds;

  const [glucose, steps, workouts, food, sleep, stravaActivities] = await Promise.all([
    db.query.glucoseReadings.findMany({
      where: and(
        eq(glucoseReadings.userId, userId),
        gte(glucoseReadings.observedAt, startUtc),
        lt(glucoseReadings.observedAt, endUtcExclusive),
      ),
      orderBy: [asc(glucoseReadings.observedAt)],
    }),
    db.query.hourlySteps.findMany({
      where: and(
        eq(hourlySteps.userId, userId),
        gte(hourlySteps.bucketStart, startUtc),
        lt(hourlySteps.bucketStart, endUtcExclusive),
      ),
      orderBy: [asc(hourlySteps.bucketStart)],
    }),
    db.query.manualWorkouts.findMany({
      where: and(
        eq(manualWorkouts.userId, userId),
        gte(manualWorkouts.startedAt, startUtc),
        lt(manualWorkouts.startedAt, endUtcExclusive),
      ),
    }),
    db.query.foodEntries.findMany({
      where: and(
        eq(foodEntries.userId, userId),
        gte(foodEntries.eatenAt, startUtc),
        lt(foodEntries.eatenAt, endUtcExclusive),
      ),
    }),
    db.query.sleepWindows.findMany({
      where: and(
        eq(sleepWindows.userId, userId),
        lt(sleepWindows.sleepStart, endUtcExclusive),
        gte(sleepWindows.sleepEnd, startUtc),
      ),
    }),
    db.query.activities.findMany({
      where: and(
        eq(activities.userId, userId),
        eq(activities.provider, "strava"),
        gte(activities.startAt, startUtc),
        lt(activities.startAt, endUtcExclusive),
      ),
    }),
  ]);

  const tir = calculateTir(
    glucose.map((g) => ({ observedAt: g.observedAt, mgdl: g.mgdl })),
    { targetLowMgdl, targetHighMgdl },
  );
  const avgGlucoseMgdl = glucose.length
    ? Math.round(glucose.reduce((sum, g) => sum + g.mgdl, 0) / glucose.length)
    : null;
  const glucoseMinMgdl = glucose.length ? Math.min(...glucose.map((g) => g.mgdl)) : null;
  const glucoseMaxMgdl = glucose.length ? Math.max(...glucose.map((g) => g.mgdl)) : null;

  const stepsMerged = mergeHourlyStepsPreferShortcutsFile(steps);
  const totalSteps = stepsMerged.reduce((sum, s) => sum + s.stepCount, 0);

  const hourlyStepsByLocalHour = new Array<number>(24).fill(0);
  for (const s of stepsMerged) {
    const h = localClockHourFromDate(s.bucketStart, timeZone);
    if (h >= 0 && h < 24) hourlyStepsByLocalHour[h] += s.stepCount;
  }

  const sleepMinutes = Math.round(
    sleep.reduce((sum, s) => {
      const ms = overlapMs(s.sleepStart, s.sleepEnd, startUtc, endUtcExclusive);
      return sum + ms;
    }, 0) / 60000,
  );

  const foodCarbs = food.reduce((sum, f) => sum + (f.carbsGrams ?? 0), 0);
  const stravaDistanceMeters = stravaActivities.reduce((sum, a) => sum + (a.distanceMeters ?? 0), 0);

  return {
    dateYmd,
    timeZone,
    targets: {
      lowMgdl: targetLowMgdl,
      highMgdl: targetHighMgdl,
      tirGoalPercent: prefs.targetTirPercent,
      stepsGoalPerDay: prefs.targetStepsPerDay,
    },
    aggregates: {
      tirInRangePercent: tir.inRangePercent,
      avgGlucoseMgdl,
      glucoseReadingsCount: glucose.length,
      glucoseMinMgdl,
      glucoseMaxMgdl,
      totalSteps,
      manualWorkoutsCount: workouts.length,
      stravaActivitiesCount: stravaActivities.length,
      stravaDistanceKm: Math.round((stravaDistanceMeters / 1000) * 10) / 10,
      foodEntriesCount: food.length,
      foodCarbsGrams: Math.round(foodCarbs * 10) / 10,
      sleepMinutes,
    },
    hourlyStepsByLocalHour,
  };
}
