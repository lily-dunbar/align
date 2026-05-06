/**
 * Deterministic 4-week synthetic CGM stream (5-minute cadence) for fixtures / exports.
 */

import { addDays } from "date-fns";
import { formatInTimeZone, toDate } from "date-fns-tz";

import {
  DEMO_BG_CURVE_SEED,
  demoGlucoseMgdlForSample,
  getDemoGlucoseDayState,
  type DemoGlucoseDayState,
} from "@/lib/demo/demo-bg-curve";

export type BgReading5Min = {
  observedAtIso: string;
  mgdl: number;
  activity: boolean;
};

export type GenerateFourWeekBgParams = {
  anchorYmd: string;
  timeZone: string;
  seed?: string;
};

const INTERVAL_MIN = 5;
const SLOTS_PER_DAY = (24 * 60) / INTERVAL_MIN;
export const FOUR_WEEK_SLOT_COUNT = 28 * SLOTS_PER_DAY;

/** 0 = Monday … 6 = Sunday in `timeZone` */
function weekdayMon0(dayStartUtc: Date, timeZone: string): number {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(dayStartUtc);
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

function dayStartUtcForOffset(anchorYmd: string, dayOffset: number, timeZone: string): Date {
  const anchorNoon = toDate(`${anchorYmd}T12:00:00`, { timeZone });
  const shifted = addDays(anchorNoon, dayOffset);
  const ymd = formatInTimeZone(shifted, timeZone, "yyyy-MM-dd");
  return toDate(`${ymd}T00:00:00`, { timeZone });
}

function addMinutesMillis(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60_000);
}

/**
 * Produce 28 consecutive local days × 288 five-minute samples.
 */
export function generateFourWeekBgSeries(params: GenerateFourWeekBgParams): BgReading5Min[] {
  const { anchorYmd, timeZone, seed = DEMO_BG_CURVE_SEED } = params;
  const out: BgReading5Min[] = [];
  const expected = 28 * SLOTS_PER_DAY;
  let write = 0;

  for (let d = 0; d < 28; d += 1) {
    const dayStart = dayStartUtcForOffset(anchorYmd, d, timeZone);
    const ymd = formatInTimeZone(dayStart, timeZone, "yyyy-MM-dd");
    const wday = weekdayMon0(dayStart, timeZone);
    const isWeekend = wday === 5 || wday === 6;

    const state: DemoGlucoseDayState = getDemoGlucoseDayState(ymd, seed, isWeekend);

    for (let slot = 0; slot < SLOTS_PER_DAY; slot += 1) {
      const observedAt = addMinutesMillis(dayStart, slot * INTERVAL_MIN);
      const hourF = localHourFraction(observedAt, timeZone);

      const mgdl = demoGlucoseMgdlForSample({
        hourF,
        slotIndex: slot,
        ymd,
        seed,
        isWeekend,
        state,
      });

      const activity = !isWeekend && hourF >= 17.5 && hourF < 18;

      out[write] = {
        observedAtIso: observedAt.toISOString(),
        mgdl,
        activity,
      };
      write += 1;
    }
  }

  if (write !== expected) {
    throw new Error(`generateFourWeekBgSeries: expected ${expected} samples, got ${write}`);
  }
  return out;
}
