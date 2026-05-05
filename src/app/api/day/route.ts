import { and, asc, eq, gte, lt } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import {
  activities,
  foodEntries,
  glucoseReadings,
  hourlySteps,
  manualWorkouts,
  sleepWindows,
} from "@/db/schema";
import { metersToMilesDisplay } from "@/lib/distance-units";
import { buildDemoDayApiPayload } from "@/lib/demo/build-demo-day-api";
import { isDemoDataActive } from "@/lib/demo/is-demo-data-active";
import { dayBoundsUtcForYmd, todayBoundsUtc } from "@/lib/day-bounds";
import {
  clampTargetHighMgdl,
  clampTargetLowMgdl,
  getUserPreferences,
} from "@/lib/user-display-preferences";
import { mergeHourlyStepsPreferShortcutsFile } from "@/lib/merge-hourly-steps-sources";
import { calculateTir } from "@/lib/tir";

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

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const timeZone = url.searchParams.get("timeZone") ?? "UTC";

  const prefs = await getUserPreferences(userId);
  let targetLowMgdl = prefs.targetLowMgdl;
  let targetHighMgdl = prefs.targetHighMgdl;
  const qLow = url.searchParams.get("targetLowMgdl");
  const qHigh = url.searchParams.get("targetHighMgdl");
  if (qLow != null && qLow !== "") {
    const n = Number(qLow);
    if (Number.isFinite(n)) targetLowMgdl = clampTargetLowMgdl(n);
  }
  if (qHigh != null && qHigh !== "") {
    const n = Number(qHigh);
    if (Number.isFinite(n)) targetHighMgdl = clampTargetHighMgdl(n);
  }
  if (targetLowMgdl >= targetHighMgdl) {
    targetLowMgdl = prefs.targetLowMgdl;
    targetHighMgdl = prefs.targetHighMgdl;
  }

  let bounds;
  try {
    bounds = date ? dayBoundsUtcForYmd(date, timeZone) : todayBoundsUtc(timeZone);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid day parameters";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { startUtc, endUtcExclusive } = bounds;

  if (await isDemoDataActive(userId)) {
    const demoPayload = buildDemoDayApiPayload({
      userId,
      date: date ?? null,
      timeZone,
      startUtc,
      endUtcExclusive,
      prefs: {
        ...prefs,
        targetLowMgdl,
        targetHighMgdl,
      },
    });
    return NextResponse.json(demoPayload);
  }

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
      orderBy: [asc(manualWorkouts.startedAt)],
    }),
    db.query.foodEntries.findMany({
      where: and(
        eq(foodEntries.userId, userId),
        gte(foodEntries.eatenAt, startUtc),
        lt(foodEntries.eatenAt, endUtcExclusive),
      ),
      orderBy: [asc(foodEntries.eatenAt)],
    }),
    db.query.sleepWindows.findMany({
      where: and(
        eq(sleepWindows.userId, userId),
        lt(sleepWindows.sleepStart, endUtcExclusive),
        gte(sleepWindows.sleepEnd, startUtc),
      ),
      orderBy: [asc(sleepWindows.sleepStart)],
    }),
    db.query.activities.findMany({
      where: and(
        eq(activities.userId, userId),
        eq(activities.provider, "strava"),
        gte(activities.startAt, startUtc),
        lt(activities.startAt, endUtcExclusive),
      ),
      orderBy: [asc(activities.startAt)],
    }),
  ]);

  const tir = calculateTir(
    glucose.map((g) => ({ observedAt: g.observedAt, mgdl: g.mgdl })),
    { targetLowMgdl, targetHighMgdl },
  );
  const avgGlucoseMgdl = glucose.length
    ? Math.round(glucose.reduce((sum, g) => sum + g.mgdl, 0) / glucose.length)
    : null;

  const stepsMerged = mergeHourlyStepsPreferShortcutsFile(steps);
  const totalSteps = stepsMerged.reduce((sum, s) => sum + s.stepCount, 0);
  const workoutsDurationMin = workouts.reduce(
    (sum, w) =>
      sum +
      (w.durationMin ??
        (w.endedAt ? Math.max(0, Math.round((w.endedAt.getTime() - w.startedAt.getTime()) / 60000)) : 0)),
    0,
  );
  const foodCarbs = food.reduce((sum, f) => sum + (f.carbsGrams ?? 0), 0);
  const foodCalories = food.reduce((sum, f) => sum + (f.calories ?? 0), 0);
  const stravaDistanceMeters = stravaActivities.reduce(
    (sum, a) => sum + (a.distanceMeters ?? 0),
    0,
  );
  const stravaDistanceMi = metersToMilesDisplay(stravaDistanceMeters, 1);

  const sleepMinutes = Math.round(
    sleep.reduce((sum, s) => {
      const ms = overlapMs(s.sleepStart, s.sleepEnd, startUtc, endUtcExclusive);
      return sum + ms;
    }, 0) / 60000,
  );

  return NextResponse.json({
    day: {
      date: date ?? null,
      timeZone,
      startUtc: startUtc.toISOString(),
      endUtcExclusive: endUtcExclusive.toISOString(),
    },
    targets: {
      lowMgdl: targetLowMgdl,
      highMgdl: targetHighMgdl,
      tirGoalPercent: prefs.targetTirPercent,
      stepsGoalPerDay: prefs.targetStepsPerDay,
    },
    aggregates: {
      tir,
      avgGlucoseMgdl,
      glucoseCount: glucose.length,
      totalSteps,
      workoutsCount: workouts.length,
      workoutsDurationMin,
      foodEntriesCount: food.length,
      foodCarbsGrams: foodCarbs,
      foodCalories,
      sleepWindowsCount: sleep.length,
      sleepMinutes,
      stravaActivitiesCount: stravaActivities.length,
      stravaDistanceMeters,
      stravaDistanceMi,
    },
    streams: {
      glucose,
      hourlySteps: stepsMerged,
      manualWorkouts: workouts,
      foodEntries: food,
      sleepWindows: sleep,
      stravaActivities,
    },
  });
}
