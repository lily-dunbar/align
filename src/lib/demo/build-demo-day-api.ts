import { addHours, addMinutes } from "date-fns";

import { metersToMilesDisplay } from "@/lib/distance-units";
import type { UserPreferences } from "@/lib/user-display-preferences";
import { calculateTir, type GlucosePoint } from "@/lib/tir";

function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Stable 0–2^32-ish hash from calendar identity (reproducible per day). */
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

function isMonWedFri(w: number): boolean {
  return w === 0 || w === 2 || w === 4;
}

function isWeekdayMonFri(w: number): boolean {
  return w <= 4;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function gauss(hourF: number, center: number, sigma: number): number {
  return Math.exp(-((hourF - center) ** 2) / sigma);
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

const FOUR_MILES_METERS = Math.round(4 * 1609.34);

type SleepPlan = {
  sleepStart: Date;
  sleepEnd: Date;
  /** Short / fragmented sleep — higher dawn BG, rockier overnight trace. */
  restricted: boolean;
};

function planSleepForDemoDay(startUtc: Date, date: string | null, wday: number): SleepPlan {
  const h = dayHash(date, wday);
  /** Adequate most nights; ~36% “short sleep” stories for demo. */
  const restricted = h % 11 < 4;
  if (restricted) {
    if (h % 2 === 0) {
      // Late to bed, early alarm (~5h20)
      return {
        sleepStart: addMinutes(startUtc, 45),
        sleepEnd: addMinutes(startUtc, 5 * 60 + 17),
        restricted: true,
      };
    }
    // In bed earlier but wake pre-dawn (~5h45)
    return {
      sleepStart: addMinutes(startUtc, -55),
      sleepEnd: addMinutes(startUtc, 4 * 60 + 50),
      restricted: true,
    };
  }
  // Typical weeknight stretch (~7h35)
  return {
    sleepStart: addMinutes(startUtc, -95),
    sleepEnd: addMinutes(startUtc, 6 * 60 + 40),
    restricted: false,
  };
}

function inWindow(t: Date, a: Date, b: Date): boolean {
  const x = t.getTime();
  return x >= a.getTime() && x < b.getTime();
}

/**
 * Synthetic day: activity-shaped curve with diabetic-realistic jitter, weekend chaos,
 * and sleep-linked overnight / dawn behavior for demo.
 */
export function buildDemoDayApiPayload(args: DemoDayArgs) {
  const { userId, date, timeZone, startUtc, endUtcExclusive, prefs } = args;
  const targetLowMgdl = prefs.targetLowMgdl;
  const targetHighMgdl = prefs.targetHighMgdl;

  const firstPoint = startUtc;
  const wday = weekdayMon0(firstPoint, timeZone);
  const runDay = isMonWedFri(wday);
  const weekday = isWeekdayMonFri(wday);
  const weekend = wday >= 5;
  const dh = dayHash(date, wday);

  const sleepPlan = planSleepForDemoDay(startUtc, date, wday);
  const wakeHourFL = localHourFraction(sleepPlan.sleepEnd, timeZone);
  const lunchCenter =
    12.5 +
    (weekend ? (noise(dh) - 0.5) * 0.55 : 0) +
    (noise(dh + 11) - 0.5) * 0.12;
  const lunchSigma = weekend ? 0.58 : 0.45;

  const glucosePoints: GlucosePoint[] = [];
  let idx = 0;
  let rw = (noise(dh) - 0.5) * 6;
  for (let min = 0; min < 1440; min += 5) {
    const observedAt = addMinutes(startUtc, min);
    const hourF = localHourFraction(observedAt, timeZone);
    const n = noise(idx + (date?.length ?? 0) + dh) * 8 - 4;
    rw = rw * 0.88 + (noise(idx * 3 + dh) - 0.5) * 2.8;
    const dreaming = inWindow(observedAt, sleepPlan.sleepStart, sleepPlan.sleepEnd);
    const shortSleepMorning =
      sleepPlan.restricted && hourF >= 4.5 && hourF < 11 && !dreaming;
    const chaos = (weekend ? 1.42 : 1) * (sleepPlan.restricted ? 1.28 : 1) * (dreaming && sleepPlan.restricted ? 1.35 : 1);
    const nEff = n * (0.55 + chaos * 0.45);

    let mgdl = 118 + 10 * Math.sin(((hourF - 15) / 24) * Math.PI * 2);

    if (hourF >= 22 || hourF < 5.5) {
      mgdl = 104 + nEff * 0.85;
      if (weekend) mgdl += (noise(idx + 404) - 0.5) * 14;
    }

    if (dreaming && sleepPlan.restricted) {
      mgdl += 6 * Math.sin(min / 55) + nEff * 0.9;
      mgdl += 18 * gauss(hourF, wakeHourFL - 0.35, 0.28);
    }

    if (shortSleepMorning) {
      mgdl += 14 + (hourF - 4.5) * 3.2 + nEff * 0.65;
    }

    if (weekday && hourF >= 6.5 && hourF < 8) {
      mgdl = 118 + (hourF - 6.5) * (weekend ? 4.2 : 5);
    }
    if (weekend && hourF >= 6.5 && hourF < 9) {
      mgdl += (noise(dh + idx) - 0.5) * 22;
    }

    if (weekday && hourF >= 8 && hourF < 8.5) {
      mgdl -= 22 * gauss(hourF, 8.25, weekend ? 0.06 : 0.04);
    }
    if (weekend && hourF >= 8 && hourF < 10) {
      mgdl -= 14 * gauss(hourF, 8.6, 0.09);
    }

    if (hourF >= 8.5 && hourF < 11.5) {
      mgdl = 116 + nEff * (weekend ? 0.6 : 0.35);
    }

    mgdl += (weekend ? 108 : 125) * gauss(hourF, lunchCenter, lunchSigma);
    if (weekend) mgdl += (noise(dh + min) - 0.5) * 18;

    if (hourF >= 13 && hourF < 16.5) {
      mgdl = 124 + (hourF - 13) * 0.8 + nEff * (weekend ? 0.5 : 0.25);
    }

    if (hourF >= 16.5 && hourF < 17 && weekday) {
      mgdl += 6 * gauss(hourF, 16.75, 0.06);
    }
    if (weekend && hourF >= 15 && hourF < 18) {
      mgdl += (noise(dh * 7 + idx) - 0.5) * 15;
    }

    if (runDay && hourF >= 17 && hourF <= 18.08) {
      const u = clamp((hourF - 17) / 1.08, 0, 1);
      mgdl = 178 * (1 - u) + 102 * u + nEff * 0.55;
    } else if (!runDay && weekday && hourF >= 17 && hourF < 18) {
      mgdl = 128 + nEff * 0.45;
    }

    if (hourF > 18 && hourF < 19) {
      mgdl += 12 + nEff * (weekend ? 0.45 : 0.2);
    }

    if (hourF >= 19 && hourF < 20) {
      mgdl += 22 * gauss(hourF, 19.45, weekend ? 0.16 : 0.12);
    }

    if (hourF >= 20 && hourF < 22) {
      mgdl = 118 + nEff * (weekend ? 0.55 : 0.25);
    }

    if (noise(dh + 900 + wday) > 0.88 && hourF > 14 && hourF < 20) {
      mgdl += 22 * gauss(hourF, 15.7 + (dh % 7) * 0.35, 0.18);
    }

    mgdl += rw * 0.35;

    glucosePoints.push({
      observedAt,
      mgdl: clamp(Math.round(mgdl + nEff * 0.45), 68, 280),
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
    let steps = Math.round(220 + noise(h * 19 + wday) * 120);
    if (weekday && h === 8) steps += 2650;
    if (weekday && h === 12) steps += 520;
    if (weekday && h === 16) steps += 2100;
    if (runDay && (h === 17 || h === 18)) steps += 4200;
    if (!runDay && weekday && h === 17) steps += 900;
    hourlyStepsRows.push({
      id: `demo-steps-${date ?? "d"}-${h}`,
      userId,
      bucketStart,
      stepCount: Math.max(0, Math.min(16000, steps)),
      source: "demo_preview",
      receivedAt: bucketStart,
      createdAt: bucketStart,
      updatedAt: bucketStart,
    });
  }

  const stravaActivities =
    runDay
      ? (() => {
          const runStart = addMinutes(addHours(startUtc, 17), 5);
          const runEnd = addMinutes(runStart, 52);
          return [
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
              durationSec: 52 * 60,
              movingTimeSec: 50 * 60,
              elapsedTimeSec: 52 * 60,
              distanceMeters: FOUR_MILES_METERS,
              totalElevationGainMeters: 48,
              averageHeartrate: 148,
              maxHeartrate: 172,
              averageWatts: null as number | null,
              kilojoules: 510,
              calories: 445,
              sourcePayload: null as string | null,
              createdAt: runStart,
              updatedAt: runStart,
            },
          ];
        })()
      : [];

  const lunchAt = addHours(startUtc, 11);
  const foodEntries = [
    {
      id: `demo-food-${date ?? "d"}`,
      userId,
      eatenAt: lunchAt,
      title: "Lunch",
      carbsGrams: 72,
      proteinGrams: 32,
      fatGrams: 16,
      calories: 580,
      notes: null as string | null,
      createdAt: lunchAt,
      updatedAt: lunchAt,
    },
  ];

  const sleepWindows = [
    {
      id: `demo-sleep-${date ?? "d"}`,
      userId,
      sleepStart: sleepPlan.sleepStart,
      sleepEnd: sleepPlan.sleepEnd,
      source: "manual" as const,
      qualityScore: null as number | null,
      notes: (sleepPlan.restricted ? "demo: shorter sleep" : "demo: typical night") as string | null,
      createdAt: sleepPlan.sleepStart,
      updatedAt: sleepPlan.sleepStart,
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
      foodCarbsGrams: 72,
      foodCalories: 580,
      sleepWindowsCount: sleepWindows.length,
      sleepMinutes,
      stravaActivitiesCount: stravaActivities.length,
      stravaDistanceMeters: stravaActivities[0]?.distanceMeters ?? 0,
      stravaDistanceMi: metersToMilesDisplay(stravaActivities[0]?.distanceMeters ?? 0, 1),
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
