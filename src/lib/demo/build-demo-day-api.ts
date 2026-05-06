import { addHours, addMinutes } from "date-fns";

import {
  DEMO_BG_CURVE_SEED,
  demoGlucoseMgdlForSample,
  getDemoGlucoseDayState,
  type DemoGlucoseDayState,
  ymdInZone,
} from "@/lib/demo/demo-bg-curve";
import { toFoodTypeNote } from "@/lib/food-type-tag";
import { getDemoDayProfile } from "@/lib/demo/demo-day-profile";
import { metersToMilesDisplay } from "@/lib/distance-units";
import type { UserPreferences } from "@/lib/user-display-preferences";
import { calculateTir, type GlucosePoint } from "@/lib/tir";

function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Stable hash for id suffixes only */
function dayHash(date: string | null, wday: number): number {
  const s = date ?? "demo-day";
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= wday * 0x9e3779b9;
  return h >>> 0;
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

/** 0 = Monday … 6 = Sunday (local calendar in `timeZone`). */
function weekdayMon0(isoUtc: Date, timeZone: string): number {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(isoUtc);
  const map: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  return map[short] ?? 0;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
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

function weekendDemoFoodEntries(args: {
  userId: string;
  date: string | null;
  state: DemoGlucoseDayState;
  eatenAtBeforePeakHour: (peakHourLocal: number) => Date;
}) {
  const { userId, date, state, eatenAtBeforePeakHour } = args;
  const d = date ?? "d";
  const rows = [
    {
      id: `demo-food-wknd-a-${d}`,
      eatenAt: eatenAtBeforePeakHour(state.spike1Center),
      title: "Brunch",
      carbsGrams: 52,
      proteinGrams: 18,
      fatGrams: 14,
      calories: 420,
      notes: toFoodTypeNote("fast_acting"),
    },
    {
      id: `demo-food-wknd-b-${d}`,
      eatenAt: eatenAtBeforePeakHour(state.spike2Center),
      title: "Lunch",
      carbsGrams: 38,
      proteinGrams: 8,
      fatGrams: 12,
      calories: 310,
      notes: toFoodTypeNote("fast_acting"),
    },
    {
      id: `demo-food-wknd-c-${d}`,
      eatenAt: eatenAtBeforePeakHour(state.spike3Center),
      title: "Dinner",
      carbsGrams: 62,
      proteinGrams: 26,
      fatGrams: 24,
      calories: 610,
      notes: toFoodTypeNote("slow_acting"),
    },
  ].sort((a, b) => a.eatenAt.getTime() - b.eatenAt.getTime());

  return rows.map((r) => ({
    id: r.id,
    userId,
    eatenAt: r.eatenAt,
    title: r.title,
    carbsGrams: r.carbsGrams,
    proteinGrams: r.proteinGrams,
    fatGrams: r.fatGrams,
    calories: r.calories,
    notes: r.notes,
    createdAt: r.eatenAt,
    updatedAt: r.eatenAt,
  }));
}

/** ~4 mi easy — matches 30 min post-work run */
const RUN_DISTANCE_METERS = Math.round(4 * 1609.34);

export function buildDemoDayApiPayload(args: DemoDayArgs) {
  const { userId, date, timeZone, startUtc, endUtcExclusive, prefs } = args;
  const targetLowMgdl = prefs.targetLowMgdl;
  const targetHighMgdl = prefs.targetHighMgdl;

  const firstPoint = startUtc;
  const wday = weekdayMon0(firstPoint, timeZone);
  const dh = dayHash(date, wday);
  const isWeekend = wday === 5 || wday === 6;
  const ymd = ymdInZone(startUtc, timeZone);
  const glucoseState = getDemoGlucoseDayState(ymd, DEMO_BG_CURVE_SEED, isWeekend);
  const dayProfile = getDemoDayProfile(ymd, DEMO_BG_CURVE_SEED);

  /** Prior evening → morning — overlaps midnight so the chart shows overnight sleep */
  const sleepStart = addMinutes(startUtc, -150);
  const sleepEnd = addMinutes(startUtc, Math.round(6.5 * 60));

  const glucosePoints: GlucosePoint[] = [];
  let idx = 0;
  for (let min = 0; min < 1440; min += 5) {
    const observedAt = addMinutes(startUtc, min);
    const hourF = localHourFraction(observedAt, timeZone);
    const mgdl = demoGlucoseMgdlForSample({
      hourF,
      slotIndex: idx,
      ymd,
      seed: DEMO_BG_CURVE_SEED,
      isWeekend,
      state: glucoseState,
    });
    glucosePoints.push({
      observedAt,
      mgdl: clamp(mgdl, 68, 320),
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

  const weights: number[] = [];
  for (let hourBucket = 0; hourBucket < 24; hourBucket += 1) {
    let w = 35 + noise(hourBucket * 19 + wday + dh) * 28;
    if (!isWeekend) {
      if (hourBucket === 8) w += 420;
      if (hourBucket === 12) w += 95;
      if (hourBucket === 17) w += 900;
      if (hourBucket === 18) w += 480;
    } else if (hourBucket >= 9 && hourBucket <= 20) {
      w += noise(hourBucket * 31 + dh) * 180;
    }
    weights.push(Math.max(8, w));
  }
  const wSum = weights.reduce((a, b) => a + b, 0);
  const targetSteps = Math.max(800, dayProfile.dailySteps);
  const hourlyStepsRows = [];
  let allocated = 0;
  for (let hourBucket = 0; hourBucket < 24; hourBucket += 1) {
    const bucketStart = addHours(startUtc, hourBucket);
    let stepCount: number;
    if (hourBucket < 23) {
      stepCount = Math.max(
        0,
        Math.min(16000, Math.round((weights[hourBucket]! / wSum) * targetSteps)),
      );
      allocated += stepCount;
    } else {
      stepCount = Math.max(0, Math.min(16000, targetSteps - allocated));
    }
    hourlyStepsRows.push({
      id: `demo-steps-${date ?? "d"}-${hourBucket}`,
      userId,
      bucketStart,
      stepCount,
      source: "demo_preview",
      receivedAt: bucketStart,
      createdAt: bucketStart,
      updatedAt: bucketStart,
    });
  }

  const runStart = addMinutes(addHours(startUtc, 17), 30);
  const runEnd = addMinutes(runStart, 30);

  const stravaActivities =
    dayProfile.hasDistanceRun
      ? [
          {
            id: `demo-strava-${date ?? "d"}`,
            userId,
            provider: "strava" as const,
            providerActivityId: `align_demo_preview_${date ?? "today"}`,
            name: "After work loop",
            activityType: "Run",
            sportType: "Run",
            startAt: runStart,
            endAt: runEnd,
            durationSec: 30 * 60,
            movingTimeSec: 28 * 60,
            elapsedTimeSec: 30 * 60,
            distanceMeters: RUN_DISTANCE_METERS,
            totalElevationGainMeters: 42,
            averageHeartrate: 148,
            maxHeartrate: 172,
            averageWatts: null as number | null,
            kilojoules: 340,
            calories: 300,
            sourcePayload: null as string | null,
            createdAt: runStart,
            updatedAt: runStart,
          },
        ]
      : [];

  const swimStart = dayProfile.hasLongSwim
    ? addMinutes(startUtc, Math.max(0, Math.round((dayProfile.swimPeakHour - 0.38) * 60)))
    : null;
  const swimEnd = swimStart ? addMinutes(swimStart, 42) : null;

  const manualWorkouts =
    swimStart && swimEnd
      ? [
          {
            id: `demo-swim-${date ?? "d"}`,
            userId,
            workoutType: "Pool swim",
            startedAt: swimStart,
            endedAt: swimEnd,
            distanceMeters: null as number | null,
            pace: null as string | null,
            durationMin: 42,
            intensity: "moderate" as string | null,
            notes: null as string | null,
            createdAt: swimStart,
            updatedAt: swimStart,
          },
        ]
      : [];

  /**
   * Weekday: three meals aligned with the modeled breakfast/lunch/dinner rises.
   * Weekend: three entries ~35 min before each modeled spike peak.
   */
  const WEEKEND_LEAD_BEFORE_PEAK_MIN = 35;

  function eatenAtBeforePeakHour(peakHourLocal: number): Date {
    const peakMinFromMidnight = peakHourLocal * 60;
    const eatMin = Math.max(10, peakMinFromMidnight - WEEKEND_LEAD_BEFORE_PEAK_MIN);
    return addMinutes(startUtc, Math.round(eatMin));
  }

  const foodEntries = !isWeekend
    ? (() => {
        const breakfastAt = addMinutes(startUtc, Math.round((8.25 * 60) - WEEKEND_LEAD_BEFORE_PEAK_MIN));
        const lunchAt = addMinutes(startUtc, 11 * 60);
        const dinnerAt = addMinutes(startUtc, Math.round((19.05 * 60) - WEEKEND_LEAD_BEFORE_PEAK_MIN));
        return [
          {
            id: `demo-food-breakfast-${date ?? "d"}`,
            userId,
            eatenAt: breakfastAt,
            title: "Breakfast",
            carbsGrams: 34,
            proteinGrams: 22,
            fatGrams: 14,
            calories: 380,
            notes: toFoodTypeNote("low_impact"),
            createdAt: breakfastAt,
            updatedAt: breakfastAt,
          },
          {
            id: `demo-food-${date ?? "d"}`,
            userId,
            eatenAt: lunchAt,
            title: "Lunch",
            carbsGrams: 72,
            proteinGrams: 32,
            fatGrams: 16,
            calories: 580,
            notes: toFoodTypeNote("fast_acting"),
            createdAt: lunchAt,
            updatedAt: lunchAt,
          },
          {
            id: `demo-food-dinner-${date ?? "d"}`,
            userId,
            eatenAt: dinnerAt,
            title: "Dinner",
            carbsGrams: 66,
            proteinGrams: 34,
            fatGrams: 22,
            calories: 690,
            notes: toFoodTypeNote("slow_acting"),
            createdAt: dinnerAt,
            updatedAt: dinnerAt,
          },
        ];
      })()
    : weekendDemoFoodEntries({
        userId,
        date,
        state: glucoseState,
        eatenAtBeforePeakHour,
      });

  const sleepWindows = [
    {
      id: `demo-sleep-${date ?? "d"}`,
      userId,
      sleepStart,
      sleepEnd,
      source: "manual" as const,
      qualityScore: null as number | null,
      notes: "demo: steady overnight sleep" as string | null,
      createdAt: sleepStart,
      updatedAt: sleepStart,
    },
  ];

  const totalSteps = hourlyStepsRows.reduce((s, r) => s + r.stepCount, 0);
  const workoutsDurationMin =
    (stravaActivities.length ? 30 : 0) + (manualWorkouts.length ? 42 : 0);
  const sleepMinutes = Math.round(
    sleepWindows.reduce((sum, s) => {
      const ms = overlapMs(s.sleepStart, s.sleepEnd, startUtc, endUtcExclusive);
      return sum + ms;
    }, 0) / 60000,
  );

  const foodCarbsGrams = foodEntries.reduce((s, f) => s + f.carbsGrams, 0);
  const foodCalories = foodEntries.reduce((s, f) => s + f.calories, 0);

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
      workoutsCount: stravaActivities.length + manualWorkouts.length,
      workoutsDurationMin,
      foodEntriesCount: foodEntries.length,
      foodCarbsGrams,
      foodCalories,
      sleepWindowsCount: sleepWindows.length,
      sleepMinutes,
      stravaActivitiesCount: stravaActivities.length,
      stravaDistanceMeters: stravaActivities[0]?.distanceMeters ?? 0,
      stravaDistanceMi: metersToMilesDisplay(stravaActivities[0]?.distanceMeters ?? 0, 1),
    },
    streams: {
      glucose,
      hourlySteps: hourlyStepsRows,
      manualWorkouts,
      foodEntries,
      sleepWindows,
      stravaActivities,
    },
  };
}
