import type { PatternWindow } from "@/lib/patterns/types";

/** SessionStorage key — keeps chosen Insights range when using bottom nav. */
export const PATTERNS_WINDOW_STORAGE_KEY = "alignPatternsWindow";

/** Fired on `window` after the stored Insights range changes (cross-component refresh). */
export const PATTERNS_WINDOW_CHANGED_EVENT = "align-patterns-window";

export function parseStoredPatternWindow(raw: string | null): PatternWindow | null {
  if (raw === "7d" || raw === "30d" || raw === "90d") return raw;
  return null;
}
