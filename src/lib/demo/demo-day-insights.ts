/** Sample day-insights cards when demo mode is active (no Claude call). */
export const DEMO_DAY_INSIGHTS = [
  {
    title: "High morning steps, then lunch drives the big glucose spike",
    detail:
      "On weekdays, commute steps (around 8–8:30am) pair with a modest dip, then glucose tracks steadily until lunch — often spiking toward ~250 mg/dL before leveling out. Weekends tend to shift timing and add scatter.",
  },
  {
    title: "Afternoon movement vs a logged run",
    detail:
      "On Mon/Wed/Fri, a Strava run around 5–6pm lines up with a sustained drop (often dozens of mg/dL); a shorter 4–4:30pm step burst without a long run usually doesn’t look the same on CGM.",
  },
  {
    title: "Sleep hours show up in fasting and overnight traces",
    detail:
      "Shorter or fragmented sleep in the demo is paired with a rougher overnight line and a stronger rise toward wake; nights with more time in bed read smoother on the tail of the curve.",
  },
] as const;
