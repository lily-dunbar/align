/** Sample day-insights cards when demo mode is active (no Claude call). */
export const DEMO_DAY_INSIGHTS = [
  {
    title: "Meals and glucose",
    detail:
      "Demo data places lunch on the chart before the midday rise so the absorption band lines up with a carb-driven spike, then a return toward baseline.",
  },
  {
    title: "Activity and glucose",
    detail:
      "The sample run overlaps a dip from typical sensitivity to exercise — compare the workout band to the CGM trough that afternoon.",
  },
  {
    title: "Overnight",
    detail:
      "Sleep shading crosses midnight; glucose trends toward a steady overnight range before dawn.",
  },
] as const;
