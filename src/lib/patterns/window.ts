import type { PatternWindow } from "@/lib/patterns/types";

const WINDOW_DAYS: Record<PatternWindow, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export function isPatternWindow(value: string | undefined): value is PatternWindow {
  return value === "7d" || value === "30d" || value === "90d";
}

export function parsePatternWindow(param: string | undefined): PatternWindow {
  if (isPatternWindow(param)) return param;
  return "7d";
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
