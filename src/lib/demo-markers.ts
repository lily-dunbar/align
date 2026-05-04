/** Tag rows created by `scripts/seed-demo.ts` so re-runs can wipe safely. */

export const DEMO_GLUCOSE_SOURCE = "demo_seed";
export const DEMO_STEPS_SOURCE = "demo_seed";
export const DEMO_WORKOUT_NOTE = "align_demo_seed";
export const DEMO_STRAVA_ACTIVITY_ID_PREFIX = "align_demo_";
export const DEMO_FOOD_NOTE = "align_demo_seed";
export const DEMO_SLEEP_NOTE = "align_demo_seed";

export function isDemoModeEnabled(): boolean {
  const v = process.env.DEMO_MODE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
