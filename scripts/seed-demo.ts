/**
 * Seeds pseudo-realistic CGM + hourly steps + Strava-style activities (+ sleep/food)
 * for class demos (~75–80% TIR, visible steps vs glucose vs workout correlations).
 *
 * Usage:
 *   1. Sign in once, copy your Clerk user id (Clerk Dashboard → Users, or from JWT/session tooling).
 *   2. Save DATABASE_URL in .env.local (same as the app).
 *   3. Run:  DEMO_USER_ID=user_xxx npm run seed:demo
 *
 * Re-running removes only rows tagged with demo markers (see src/lib/demo-markers.ts).
 */
import { resolve } from "node:path";

import { config } from "dotenv";
import { addDays, addHours, addMinutes } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  DEMO_FOOD_NOTE,
  DEMO_GLUCOSE_SOURCE,
  DEMO_SLEEP_NOTE,
  DEMO_STEPS_SOURCE,
  DEMO_STRAVA_ACTIVITY_ID_PREFIX,
  DEMO_WORKOUT_NOTE,
} from "../src/lib/demo-markers";
import {
  activities,
  foodEntries,
  glucoseReadings,
  hourlySteps,
  manualWorkouts,
  sleepWindows,
  user,
  userDisplayPreferences,
} from "../src/db/schema";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const DATABASE_URL = process.env.DATABASE_URL?.trim().replace(/^["']|["']$/g, "");
const DEMO_USER_ID = process.env.DEMO_USER_ID?.trim();
const DEMO_TIME_ZONE = process.env.DEMO_TIME_ZONE?.trim() || "America/Los_Angeles";
const DEMO_DAYS = Math.min(
  90,
  Math.max(7, Number.parseInt(process.env.DEMO_DAYS ?? "21", 10) || 21),
);

function loadDatabaseUrl(): string {
  if (DATABASE_URL) return DATABASE_URL;
  console.error("Missing DATABASE_URL (.env.local or env).");
  process.exit(1);
}

function ymdTodayInTz(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Simple deterministic noise in [-1, 1]. */
function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function main() {
  if (!DEMO_USER_ID) {
    console.error("Set DEMO_USER_ID to your Clerk user id (e.g. user_2abc…).");
    process.exit(1);
  }
}

main();

const url = loadDatabaseUrl();
const client = postgres(url, { max: 1, prepare: false });
const db = drizzle(client, {
  schema: {
    user,
    userDisplayPreferences,
    glucoseReadings,
    hourlySteps,
    manualWorkouts,
    activities,
    foodEntries,
    sleepWindows,
  },
});

async function wipeDemoRows(userId: string) {
  await db.delete(glucoseReadings).where(
    and(eq(glucoseReadings.userId, userId), eq(glucoseReadings.source, DEMO_GLUCOSE_SOURCE)),
  );
  await db.delete(hourlySteps).where(
    and(eq(hourlySteps.userId, userId), eq(hourlySteps.source, DEMO_STEPS_SOURCE)),
  );
  await db
    .delete(manualWorkouts)
    .where(and(eq(manualWorkouts.userId, userId), eq(manualWorkouts.notes, DEMO_WORKOUT_NOTE)));
  await db
    .delete(foodEntries)
    .where(and(eq(foodEntries.userId, userId), eq(foodEntries.notes, DEMO_FOOD_NOTE)));
  await db
    .delete(sleepWindows)
    .where(and(eq(sleepWindows.userId, userId), eq(sleepWindows.notes, DEMO_SLEEP_NOTE)));
}

/** Remove Strava demo rows (prefix ids) without touching real Strava sync. */
async function wipeDemoStravaActivities(userId: string) {
  const rows = await db.query.activities.findMany({
    where: and(eq(activities.userId, userId), eq(activities.provider, "strava")),
    columns: { id: true, providerActivityId: true },
  });
  for (const r of rows) {
    if (r.providerActivityId.startsWith(DEMO_STRAVA_ACTIVITY_ID_PREFIX)) {
      await db.delete(activities).where(eq(activities.id, r.id));
    }
  }
}

function localHourFraction(isoUtc: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(isoUtc);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour + minute / 60;
}

async function seed() {
  const userId = DEMO_USER_ID!;

  await db.insert(user).values({ id: userId, name: "Demo student" }).onConflictDoNothing();

  await db
    .insert(userDisplayPreferences)
    .values({ userId })
    .onConflictDoNothing();

  await wipeDemoRows(userId);
  await wipeDemoStravaActivities(userId); // prefix-only; does not remove real Strava sync rows

  const ymdEnd = ymdTodayInTz(DEMO_TIME_ZONE);
  const endMidnightUtc = fromZonedTime(`${ymdEnd}T00:00:00`, DEMO_TIME_ZONE);

  let glucoseBatch: {
    userId: string;
    observedAt: Date;
    mgdl: number;
    source: string;
  }[] = [];

  const flushGlucose = async () => {
    if (!glucoseBatch.length) return;
    await db.insert(glucoseReadings).values(glucoseBatch);
    glucoseBatch = [];
  };

  for (let dayIdx = 0; dayIdx < DEMO_DAYS; dayIdx++) {
    const dayStartUtc = addDays(endMidnightUtc, -(DEMO_DAYS - 1) + dayIdx);
    const isRunDay = dayIdx % 3 === 0;
    const isWeekend = (dayIdx + 6) % 7 >= 5;

    for (let min = 0; min < 1440; min += 5) {
      const observedAt = addMinutes(dayStartUtc, min);
      const hourF = localHourFraction(observedAt, DEMO_TIME_ZONE);
      const idx = dayIdx * 288 + min / 5;
      const tirBucket = idx % 100;

      let mgdl =
        108 +
        32 * Math.sin(((hourF - 13) / 24) * Math.PI * 2) +
        noise(idx) * 14;

      if (hourF >= 7.25 && hourF < 9.25) mgdl += 22 * Math.exp(-((hourF - 8.2) ** 2) / 0.55);
      if (hourF >= 11.75 && hourF < 14.25) mgdl += 38 * Math.exp(-((hourF - 12.9) ** 2) / 0.7);
      if (hourF >= 18.25 && hourF < 21) mgdl += 32 * Math.exp(-((hourF - 19.1) ** 2) / 0.55);

      if (isRunDay && hourF >= 7 && hourF < 7.85) {
        mgdl -= 38 * Math.sin(((hourF - 7) / 0.85) * Math.PI);
      }

      const protectRun = isRunDay && hourF >= 6.75 && hourF < 8.5;
      if (tirBucket < 11 && !protectRun) {
        mgdl = 56 + (tirBucket % 6) * 2 + noise(idx) * 4;
      } else if (tirBucket < 23 && !protectRun) {
        mgdl = 188 + (tirBucket % 7) * 4 + noise(idx + 1) * 8;
      } else {
        mgdl = Math.min(235, Math.max(68, mgdl));
      }

      glucoseBatch.push({
        userId,
        observedAt,
        mgdl: Math.round(mgdl),
        source: DEMO_GLUCOSE_SOURCE,
      });
      if (glucoseBatch.length >= 400) await flushGlucose();
    }

    for (let h = 0; h < 24; h++) {
      const bucketStart = addHours(dayStartUtc, h);
      let steps = Math.round(320 + noise(dayIdx * 48 + h) * 220 + (isWeekend ? 180 : 0));
      if (isRunDay && (h === 7 || h === 8)) {
        steps += h === 7 ? 2200 : 900;
      }
      if (h >= 11 && h <= 14) steps += 350;
      steps = Math.max(0, Math.min(12000, steps));
      await db.insert(hourlySteps).values({
        userId,
        bucketStart,
        stepCount: steps,
        source: DEMO_STEPS_SOURCE,
      });
    }

    if (isRunDay) {
      const start = addHours(dayStartUtc, 7);
      const end = addMinutes(start, 42);
      await db.insert(activities).values({
        userId,
        provider: "strava",
        providerActivityId: `${DEMO_STRAVA_ACTIVITY_ID_PREFIX}${dayIdx}-run`,
        name: "Campus loop",
        activityType: "Run",
        sportType: "Run",
        startAt: start,
        endAt: end,
        durationSec: 42 * 60,
        movingTimeSec: 38 * 60,
        elapsedTimeSec: 42 * 60,
        distanceMeters: 5200,
      });
    }

    await db.insert(foodEntries).values({
      userId,
      eatenAt: addMinutes(addHours(dayStartUtc, 12), 25),
      title: "Lunch",
      carbsGrams: 55,
      notes: DEMO_FOOD_NOTE,
    });

    const sleepStart = addHours(dayStartUtc, 23);
    const sleepEnd = addHours(addDays(dayStartUtc, 1), 6.5);
    await db.insert(sleepWindows).values({
      userId,
      sleepStart,
      sleepEnd,
      source: "manual",
      notes: DEMO_SLEEP_NOTE,
    });
  }

  await flushGlucose();
  console.log(
    `Demo seed complete for user ${userId}: ${DEMO_DAYS} days in ${DEMO_TIME_ZONE} (CGM source=${DEMO_GLUCOSE_SOURCE}, steps source=${DEMO_STEPS_SOURCE}).`,
  );
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await client.end({ timeout: 5 });
  });
