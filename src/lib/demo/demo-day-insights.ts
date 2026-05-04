/** Sample day-insights cards when demo mode is active (no Claude call). */
export const DEMO_DAY_INSIGHTS = [
  {
    title: "Steps and glucose rise together after lunch",
    detail:
      "Your step count ramps when glucose climbs midday — worth noting how meals and walking interact on busy days.",
  },
  {
    title: "Activity window lines up with a steadier afternoon",
    detail:
      "The stretch after your logged run lines up with fewer spikes than late evening — a pattern many users refine over time.",
  },
  {
    title: "Sleep block spans your usual overnight dip",
    detail:
      "Nighttime readings quiet down during the logged sleep window; keep tracking how late meals affect the tail end.",
  },
] as const;
