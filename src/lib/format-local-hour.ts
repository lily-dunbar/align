/**
 * Local clock hour (0–23) → short 12-hour label for prose (e.g. insights, pattern cards).
 * Matches the style used in heuristic patterns (“around 1pm”, not “13:00”).
 */
export function formatLocalHour12(hourH23: number): string {
  const h = Math.round(Math.max(0, Math.min(23, hourH23)));
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}
