import type { PatternWindow } from "@/lib/patterns/types";

const WINDOW_DAYS: Record<PatternWindow, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export function isPatternWindow(value: string | undefined): value is PatternWindow {
  const v = value?.trim().toLowerCase();
  return v === "7d" || v === "30d" || v === "90d";
}

export function parsePatternWindow(param: string | undefined): PatternWindow {
  const p = param?.trim().toLowerCase();
  if (p === "7d" || p === "30d" || p === "90d") return p;
  return "30d";
}

export function windowLabelDays(window: PatternWindow): number {
  return WINDOW_DAYS[window];
}

/** Rolling window ending at `now` (exclusive end = instant of request). */
export function rollingRangeUtc(window: PatternWindow, now = new Date()) {
  const labelDays = windowLabelDays(window);
  const startUtc = new Date(now.getTime() - labelDays * 24 * 60 * 60 * 1000);
  return {
    startUtc,
    endUtcExclusive: now,
    labelDays,
  };
}
