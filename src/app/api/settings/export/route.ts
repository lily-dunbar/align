import { asc, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { ensureUserDisplayPrefsDexcomBackfillColumn } from "@/lib/db/ensure-user-display-prefs-dexcom-column";
import {
  activities,
  dexcomTokens,
  foodEntries,
  glucoseReadings,
  hourlySteps,
  manualWorkouts,
  sleepWindows,
  stepIngestTokens,
  stravaTokens,
  user,
  userDisplayPreferences,
} from "@/db/schema";

/** Portable JSON export: health and activity data; OAuth secrets are omitted. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureUserDisplayPrefsDexcomBackfillColumn();

  const [
    userRow,
    prefs,
    dexRow,
    stravaRow,
    stepTok,
    readings,
    acts,
    steps,
    workouts,
    food,
    sleep,
  ] = await Promise.all([
    db.query.user.findFirst({ where: eq(user.id, userId) }),
    db.query.userDisplayPreferences.findFirst({
      where: eq(userDisplayPreferences.userId, userId),
    }),
    db.query.dexcomTokens.findFirst({ where: eq(dexcomTokens.userId, userId) }),
    db.query.stravaTokens.findFirst({ where: eq(stravaTokens.userId, userId) }),
    db.query.stepIngestTokens.findFirst({ where: eq(stepIngestTokens.userId, userId) }),
    db.query.glucoseReadings.findMany({
      where: eq(glucoseReadings.userId, userId),
      orderBy: [asc(glucoseReadings.observedAt)],
    }),
    db.query.activities.findMany({
      where: eq(activities.userId, userId),
      orderBy: [asc(activities.startAt)],
    }),
    db.query.hourlySteps.findMany({
      where: eq(hourlySteps.userId, userId),
      orderBy: [asc(hourlySteps.bucketStart)],
    }),
    db.query.manualWorkouts.findMany({
      where: eq(manualWorkouts.userId, userId),
      orderBy: [asc(manualWorkouts.startedAt)],
    }),
    db.query.foodEntries.findMany({
      where: eq(foodEntries.userId, userId),
      orderBy: [asc(foodEntries.eatenAt)],
    }),
    db.query.sleepWindows.findMany({
      where: eq(sleepWindows.userId, userId),
      orderBy: [asc(sleepWindows.sleepStart)],
    }),
  ]);

  const exportedAt = new Date().toISOString();
  const safeJson = JSON.stringify(
    {
      exportVersion: 1,
      exportedAt,
      userId,
      profile: userRow
        ? { id: userRow.id, name: userRow.name, email: userRow.email }
        : null,
      displayPreferences: prefs ?? null,
      integrations: {
        dexcom: dexRow
          ? {
              connected: true,
              scope: dexRow.scope,
              tokenType: dexRow.tokenType,
              expiresAt: dexRow.expiresAt?.toISOString() ?? null,
              updatedAt: dexRow.updatedAt.toISOString(),
            }
          : null,
        strava: stravaRow
          ? {
              connected: true,
              athleteId: stravaRow.athleteId,
              scope: stravaRow.scope,
              tokenType: stravaRow.tokenType,
              expiresAt: stravaRow.expiresAt?.toISOString() ?? null,
              updatedAt: stravaRow.updatedAt.toISOString(),
            }
          : null,
        stepsIngest: stepTok
          ? { connected: true, tokenSuffix: stepTok.token.slice(-6) }
          : null,
      },
      glucoseReadings: readings,
      activities: acts,
      hourlySteps: steps,
      manualWorkouts: workouts,
      foodEntries: food,
      sleepWindows: sleep,
    },
    null,
    2,
  );

  const filename = `align-export-${userId.slice(0, 12)}-${exportedAt.slice(0, 10)}.json`;

  return new NextResponse(safeJson, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
