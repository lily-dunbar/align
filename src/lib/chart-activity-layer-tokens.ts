/**
 * Single source of truth for daily chart activity layers (bands, steps) and
 * matching hues on the day “Activities” list. Keep in sync when tuning chart fills.
 */

export const CHART_SLEEP = {
  fill: "#DAE6E5",
  fillOpacity: 0.38,
} as const;

/** Legend / UI swatch approximating sleep band on white */
export const CHART_SLEEP_LEGEND_SWATCH = "rgba(218, 230, 229, 0.78)";

export const CHART_FOOD = {
  fill: "#EFF1CD",
  fillOpacity: 0.4,
} as const;

export const CHART_FOOD_LEGEND_SWATCH = "rgba(239, 241, 205, 0.92)";

/** Manual + Strava workout vertical bands */
export const CHART_WORKOUT = {
  fill: "rgba(249, 115, 22, 0.3)",
  fillOpacity: 1,
} as const;

/** Slightly stronger than band fill so legend reads on white */
export const CHART_WORKOUT_LEGEND_SWATCH = "rgba(249, 115, 22, 0.52)";

/** Hourly step bars — same blue family as `align-text-steps` in `globals.css`. */
export const CHART_STEPS_BAR_FILL = "#2f7ac4";

/** Activities panel: kind pill (manual + strava use workout row) */
export const PANEL_KIND_BADGE_CLASS = {
  workout:
    "border border-[color:rgb(234_88_12_/_0.42)] bg-[color:rgb(255_237_213_/_0.95)] text-[#c2410c]",
  food: "border border-[color:rgb(178_186_110_/_0.6)] bg-[#EFF1CD] text-[#3f6212]",
  sleep:
    "border border-[color:rgb(122_158_154_/_0.55)] bg-[color:rgb(218_230_229_/_0.92)] text-[#115e59]",
} as const;

/** Carbs chip when logged — neutral so it doesn’t compete with food band / chart greens */
export const PANEL_FOOD_CARBS_CHIP_LOGGED =
  "border border-zinc-200/90 bg-zinc-100/90 text-zinc-600";
