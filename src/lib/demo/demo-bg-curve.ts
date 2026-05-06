/**
 * Demo CGM: realistic-looking glucose — post-meal rise and exercise-associated dip on weekdays;
 * weekends are looser (irregular meals, no scripted workout dip).
 */

import { formatInTimeZone } from "date-fns-tz";

export const DEMO_BG_CURVE_SEED = "align-demo-bg-t1-v1";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep01(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

export function hashString(s: string): number {
  let h = 1779033703;
  for (let i = 0; i < s.length; i += 1) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0) || 1;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic micro-variation per slot */
export function demoSlotNoise(seed: string, ymd: string, slotIndex: number, amplitude: number): number {
  const x = Math.sin(hashString(`${seed}|${ymd}|${slotIndex}`) * 12.9898) * 43758.5453;
  const u = x - Math.floor(x);
  return (u - 0.5) * 2 * amplitude;
}

export function gaussBump(h: number, center: number, sigma: number, height: number): number {
  return height * Math.exp(-((h - center) ** 2) / (2 * sigma * sigma));
}

/**
 * Weekday shape: smooth baseline + carb spike after lunch + drop during post-work run (local hours).
 * Food log should sit slightly before the bump; Strava run spans ~5:30–6:00pm.
 */
export function weekdayArchetypeMgdl(h: number): number {
  let b: number;
  if (h < 5) {
    b = lerp(98, 104, smoothstep01(h / 5));
  } else if (h < 8.5) {
    b = lerp(104, 128, smoothstep01((h - 5) / 3.5));
  } else if (h < 23) {
    b = 128 + Math.sin((h - 8.5) * 0.2) * 7;
  } else {
    b = lerp(122, 100, smoothstep01((h - 23) / 1));
  }

  const lunchSpike = gaussBump(h, 12.42, 0.42, 56);
  const exerciseDip = gaussBump(h, 17.75, 0.32, 34);

  return b + lunchSpike - exerciseDip;
}

export type DemoGlucoseDayState = {
  /** ±20 mg/dL horizontal shift for this calendar day */
  dailyOffset: number;
  spike1Center: number;
  spike2Center: number;
  spike1Height: number;
  spike2Height: number;
};

export function getDemoGlucoseDayState(
  ymd: string,
  seed: string,
  isWeekend: boolean,
): DemoGlucoseDayState {
  const dayRng = mulberry32(hashString(`${seed}|dayvar|${ymd}`));
  const dailyOffset = (dayRng() - 0.5) * 40;

  if (!isWeekend) {
    return {
      dailyOffset,
      spike1Center: 0,
      spike2Center: 0,
      spike1Height: 0,
      spike2Height: 0,
    };
  }

  const weekendSpikeRng = mulberry32(hashString(`${seed}|wkndspike|${ymd}`));
  const spike1Center = 10 + weekendSpikeRng() * 10;
  let spike2Center = 10 + weekendSpikeRng() * 10;
  let guard = 0;
  while (Math.abs(spike1Center - spike2Center) < 2 && guard < 12) {
    spike2Center = 10 + weekendSpikeRng() * 10;
    guard += 1;
  }
  const spike1Height = 62 + weekendSpikeRng() * 18;
  const spike2Height = 58 + weekendSpikeRng() * 20;

  return {
    dailyOffset,
    spike1Center,
    spike2Center,
    spike1Height,
    spike2Height,
  };
}

/** Elevated baseline + two irregular meal spikes (local 10:00–20:00). */
export function weekendArchetypeMgdl(h: number, state: DemoGlucoseDayState): number {
  const band = 155 + Math.sin((h / 24) * Math.PI * 2) * 12;
  const s1 = gaussBump(h, state.spike1Center, 0.42, state.spike1Height);
  const s2 = gaussBump(h, state.spike2Center, 0.38, state.spike2Height);
  return band + s1 + s2;
}

export function demoGlucoseMgdlForSample(params: {
  hourF: number;
  slotIndex: number;
  ymd: string;
  seed: string;
  isWeekend: boolean;
  state: DemoGlucoseDayState;
}): number {
  const { hourF, slotIndex, ymd, seed, isWeekend, state } = params;

  let mgdl: number;
  if (!isWeekend) {
    mgdl = weekdayArchetypeMgdl(hourF);
    mgdl += state.dailyOffset;
    mgdl += demoSlotNoise(seed, ymd, slotIndex, 3);
  } else {
    mgdl = weekendArchetypeMgdl(hourF, state);
    mgdl += state.dailyOffset * 1.1;
    mgdl += demoSlotNoise(seed, ymd, slotIndex, 30);
  }

  return clamp(Math.round(mgdl), 65, 340);
}

/** Calendar day YYYY-MM-DD for `instant` as viewed in `timeZone`. */
export function ymdInZone(instant: Date, timeZone: string): string {
  return formatInTimeZone(instant, timeZone, "yyyy-MM-dd");
}
