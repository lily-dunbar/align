/** `YYYY-MM-DD` for the given instant in `timeZone` (defaults to current environment TZ). */
export function getLocalCalendarYmd(
  now = new Date(),
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !d) {
    return now.toISOString().slice(0, 10);
  }
  return `${y}-${m}-${d}`;
}
