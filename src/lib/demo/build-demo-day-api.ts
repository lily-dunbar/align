import { addDays, addHours, addMinutes } from "date-fns";

import type { UserPreferences } from "@/lib/user-display-preferences";
import { calculateTir, type GlucosePoint } from "@/lib/tir";

function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
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

type DemoDayArgs = {
  userId: string;
  date: string | null;
  timeZone: string;
  startUtc: Date;
  endUtcExclusive: Date;
  prefs: UserPreferences;
};

/**
 * Fully synthetic day payload for demo mode — correlated CGM, steps, Strava activity, sleep, food.
 */
export function buildDemoDayApiPayload(args: DemoDayArgs) {
  const { userId, date, timeZone, startUtc, endUtcExclusive, prefs } = args;
  const targetLowMgdl = prefs.targetLowMgdl;
  const targetHighMgdl = prefs.targetHighMgdl;

  const glucosePoints: GlucosePoint[] = [];
  let idx = 0;
  for (let min = 0; min < 1440; min += 5) {
    const observedAt = addMinutes(startUtc, min);
    const hourF = localHourFraction(observedAt, timeZone);
    const tirBucket = idx % 100;

    let mgdl =
      108 +
      32 * Math.sin(((hourF - 13) / 24) * Math.PI * 2) +
      noise(idx + (date?.length ?? 0)) * 14;

    if (hourF >= 7.25 && hourF < 9.25) mgdl += 22 * Math.exp(-((hourF - 8.2) ** 2) / 0.55);
    if (hourF >= 11.75 && hourF < 14.25) mgdl += 38 * Math.exp(-((hourF - 12.9) ** 2) / 0.7);
    if (hourF >= 18.25 && hourF < 21) mgdl += 32 * Math.exp(-((hourF - 19.1) ** 2) / 0.55);

    const runWindow = hourF >= 7 && hourF < 7.85;
    if (runWindow) mgdl -= 38 * Math.sin(((hourF - 7) / 0.85) * Math.PI);

    const protectRun = hourF >= 6.75 && hourF < 8.5;
    if (tirBucket < 11 && !protectRun) {
      mgdl = 56 + (tirBucket % 6) * 2 + noise(idx + 3) * 4;
    } else if (tirBucket < 23 && !protectRun) {
      mgdl = 188 + (tirBucket % 7) * 4 + noise(idx + 4) * 8;
    } else {
      mgdl = Math.min(235, Math.max(68, mgdl));
    }

    glucosePoints.push({
      observedAt,
      mgdl: Math.round(mgdl),
    });
    idx += 1;
  }

  const tir = calculateTir(glucosePoints, { targetLowMgdl, targetHighMgdl });
  const avgGlucoseMgdl = Math.round(
    glucosePoints.reduce((s, g) => s + g.mgdl, 0) / glucosePoints.length,
  );

  const glucose = glucosePoints.map((g, i) => ({
    id: `demo-bg-${date ?? "today"}-${i}`,
    userId,
    observedAt: g.observedAt,
    mgdl: g.mgdl,
    trend: null as string | null,
    trendRate: null as number | null,
    source: "demo_preview",
    createdAt: g.observedAt,
    updatedAt: g.observedAt,
  }));

  const hourlyStepsRows = [];
  for (let h = 0; h < 24; h++) {
    const bucketStart = addHours(startUtc, h);
    let steps = Math.round(340 + noise(h * 17 + 3) * 240);
    if (h === 7) steps += 2400;
    if (h === 8) steps += 950;
    if (h >= 11 && h <= 14) steps += 380;
    hourlyStepsRows.push({
      id: `demo-steps-${date ?? "d"}-${h}`,
      userId,
      bucketStart,
      stepCount: Math.max(0, Math.min(14000, steps)),
      source: "demo_preview",
      receivedAt: bucketStart,
      createdAt: bucketStart,
      updatedAt: bucketStart,
    });
  }

  const runStart = addHours(startUtc, 7);
  const runEnd = addMinutes(runStart, 42);
  const stravaActivities = [
    {
      id: `demo-strava-${date ?? "d"}`,
      userId,
      provider: "strava" as const,
      providerActivityId: `align_demo_preview_${date ?? "today"}`,
      name: "Morning run",
      activityType: "Run",
      sportType: "Run",
      startAt: runStart,
      endAt: runEnd,
      durationSec: 42 * 60,
      movingTimeSec: 40 * 60,
      elapsedTimeSec: 42 * 60,
      distanceMeters: 5200,
      totalElevationGainMeters: 42,
      averageHeartrate: 142,
      maxHeartrate: 168,
      averageWatts: null as number | null,
      kilojoules: 420,
      calories: 380,
      sourcePayload: null as string | null,
      createdAt: runStart,
      updatedAt: runStart,
    },
  ];

  const lunchAt = addMinutes(addHours(startUtc, 12), 20);
  const foodEntries = [
    {
      id: `demo-food-${date ?? "d"}`,
      userId,
      eatenAt: lunchAt,
      title: "Lunch",
      carbsGrams: 52,
      proteinGrams: 28,
      fatGrams: 14,
      calories: 520,
      notes: null as string | null,
      createdAt: lunchAt,
      updatedAt: lunchAt,
    },
  ];

  const sleepStart = addHours(startUtc, 23);
  const sleepEnd = addHours(addDays(startUtc, 1), 6.5);
  const sleepWindows = [
    {
      id: `demo-sleep-${date ?? "d"}`,
      userId,
      sleepStart,
      sleepEnd,
      source: "manual" as const,
      qualityScore: null as number | null,
      notes: null as string | null,
      createdAt: sleepStart,
      updatedAt: sleepStart,
    },
  ];

  const totalSteps = hourlyStepsRows.reduce((s, r) => s + r.stepCount, 0);
  const sleepMinutes = Math.round(
    sleepWindows.reduce((sum, s) => {
      const ms = overlapMs(s.sleepStart, s.sleepEnd, startUtc, endUtcExclusive);
      return sum + ms;
    }, 0) / 60000,
  );

  return {
    day: {
      date,
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
      workoutsCount: 0,
      workoutsDurationMin: 0,
      foodEntriesCount: foodEntries.length,
      foodCarbsGrams: 52,
      foodCalories: 520,
      sleepWindowsCount: sleepWindows.length,
      sleepMinutes,
      stravaActivitiesCount: stravaActivities.length,
      stravaDistanceMeters: 5200,
    },
    streams: {
      glucose,
      hourlySteps: hourlyStepsRows,
      manualWorkouts: [] as unknown[],
      foodEntries,
      sleepWindows,
      stravaActivities,
    },
  };
}
