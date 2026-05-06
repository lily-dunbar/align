/**
 * Per-calendar-day demo traits (deterministic from `ymd` + seed).
 * Drives: steps ↔ mean glucose, distance runs → dip, long swims → bump, weekends elevated vs weekdays.
 */

function hashString(s: string): number {
  let h = 1779033703;
  for (let i = 0; i < s.length; i += 1) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0) || 1;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function calendarYmdIsWeekend(ymd: string): boolean {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!Number.isFinite(y)) return false;
  const w = new Date(y, m - 1, d).getDay();
  return w === 0 || w === 6;
}

export function ymdWeekdaySun0(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!Number.isFinite(y)) return 0;
  return new Date(y, m - 1, d).getDay();
}

export type DemoDayProfile = {
  dailySteps: number;
  /** Added to glucose (mg/dL): more negative when steps are high */
  stepsGlucoseShift: number;
  /** Extra lift on Sat/Sun */
  weekendGlucoseLift: number;
  /** Weekday distance run with Strava + CGM dip */
  hasDistanceRun: boolean;
  /** Gaussian depth for the run dip (mg/dL at center) */
  runDipDepth: number;
  /** Pool swim ≥ ~30 min — manual workout + CGM rise */
  hasLongSwim: boolean;
  /** Local hour (fraction) of swim-related bump peak */
  swimPeakHour: number;
  swimBumpMgdl: number;
};

/** Fixed run-dip depth so patterns show a consistent “distance run” story */
export const DEMO_RUN_DIP_DEPTH = 34;

export function getDemoDayProfile(ymd: string, seed: string): DemoDayProfile {
  const rng = mulberry32(hashString(`${seed}|dayprof|${ymd}`));
  const weekend = calendarYmdIsWeekend(ymd);
  const sun0 = ymdWeekdaySun0(ymd);

  const dailySteps = Math.round(3000 + rng() * 10_500);
  const stepsGlucoseShift = -clamp((dailySteps - 7000) / 250, -32, 12);

  const weekendGlucoseLift = weekend ? 10 + rng() * 10 : 0;

  const runRng = hashString(`${seed}|run|${ymd}`) % 100;
  // One workout on most days (~75%), including weekends.
  const hasDistanceRun = runRng < (weekend ? 68 : 78);

  const swimRoll = hashString(`${seed}|swim|${ymd}`) % 100;
  // Keep swim rare and only when we didn't already assign a run.
  const hasLongSwim = !hasDistanceRun && swimRoll < (weekend ? 12 : 4);
  const swimPeakHour = weekend ? 9.5 + rng() * 2.2 : 6.8 + rng() * 1.4;
  const swimBumpMgdl = 36 + (hashString(`${seed}|swimb|${ymd}`) % 14);

  return {
    dailySteps,
    stepsGlucoseShift,
    weekendGlucoseLift,
    hasDistanceRun,
    runDipDepth: DEMO_RUN_DIP_DEPTH,
    hasLongSwim,
    swimPeakHour,
    swimBumpMgdl,
  };
}
