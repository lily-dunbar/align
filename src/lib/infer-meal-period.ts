/**
 * Time-of-day meal hint from the user's local clock (IANA `timeZone`).
 * Rule-based only — no model calls; useful for labels and empty-state hints.
 */

export type InferredMealPeriod = "breakfast" | "lunch" | "dinner" | "snack";

const LABEL: Record<InferredMealPeriod, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

function localHourFraction(isoUtc: string, timeZone: string): number | null {
  const t = new Date(isoUtc).getTime();
  if (!Number.isFinite(t)) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date(isoUtc));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "NaN");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  if (!Number.isFinite(hour)) return null;
  return hour + minute / 60;
}

/**
 * Maps local time to a coarse meal period. Outside main meal bands → `snack`
 * (late night / very early morning).
 */
export function inferMealPeriodFromLocalTime(
  eatenAtIsoUtc: string,
  timeZone: string,
): { period: InferredMealPeriod; label: string } {
  const h = localHourFraction(eatenAtIsoUtc, timeZone);
  if (h == null) {
    return { period: "snack", label: LABEL.snack };
  }

  let period: InferredMealPeriod;
  // ~4:00–10:59 breakfast, 11:00–15:59 lunch, 16:00–21:59 dinner
  if (h >= 4 && h < 11) period = "breakfast";
  else if (h >= 11 && h < 16) period = "lunch";
  else if (h >= 16 && h < 22) period = "dinner";
  else period = "snack";

  return { period, label: LABEL[period] };
}
