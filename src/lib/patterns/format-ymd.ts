/** Local hour 0–23 in `timeZone` (for time-of-day glucose trends). */
export function localHourH23(d: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(d);
  const hour = parts.find((p) => p.type === "hour")?.value;
  return hour != null ? Number(hour) : 0;
}

/** Local calendar date in `timeZone`, ISO-like `YYYY-MM-DD`. */
export function formatYmdInZone(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error(`Could not format date in time zone: ${timeZone}`);
  }
  return `${year}-${month}-${day}`;
}

/** Whether local calendar day is Saturday or Sunday in `timeZone`. */
export function isWeekendInZone(d: Date, timeZone: string): boolean {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  })
    .formatToParts(d)
    .find((p) => p.type === "weekday")?.value;
  return name === "Sat" || name === "Sun";
}

