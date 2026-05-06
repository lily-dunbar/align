import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import { formatYmdInZone } from "@/lib/patterns/format-ymd";

/** `YYYY-MM-DD` for `isoUtc` interpreted in `timeZone`. */
export function utcIsoToZonedDateInput(isoUtc: string, timeZone: string): string {
  const d = new Date(isoUtc);
  if (!Number.isFinite(d.getTime())) return "";
  return formatInTimeZone(d, timeZone, "yyyy-MM-dd");
}

/** `HH:mm` (24h) for `isoUtc` interpreted in `timeZone`. */
export function utcIsoToZonedTimeInput(isoUtc: string, timeZone: string): string {
  const d = new Date(isoUtc);
  if (!Number.isFinite(d.getTime())) return "12:00";
  return formatInTimeZone(d, timeZone, "HH:mm");
}

/**
 * Interprets `dateYmd` + `timeHm` as wall-clock in `timeZone` and returns a UTC ISO string
 * suitable for APIs and `Date` parsing.
 */
export function zonedDateTimeToUtcIso(dateYmd: string, timeHm: string, timeZone: string): string {
  const normalized = /^\d{1,2}:\d{2}$/.test(timeHm) ? timeHm : "12:00";
  const [hRaw, mRaw] = normalized.split(":");
  const hh = String(Number(hRaw)).padStart(2, "0");
  const mm = String(Number(mRaw)).padStart(2, "0");
  const combined = `${dateYmd}T${hh}:${mm}:00`;
  return fromZonedTime(combined, timeZone).toISOString();
}

/** Whether `isoUtc` falls on calendar day `ymd` in `timeZone`. */
export function isYmdSameDayInZone(isoUtc: string, ymd: string, timeZone: string): boolean {
  const d = new Date(isoUtc);
  if (!Number.isFinite(d.getTime())) return false;
  return formatYmdInZone(d, timeZone) === ymd;
}
