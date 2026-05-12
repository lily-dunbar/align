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
  /** Day-level insulin sensitivity scalar (higher => smaller meal spikes). */
  insulinSensitivity: number;
  /** Relative carb load multiplier for the day (higher => larger meal excursions). */
  carbLoadFactor: number;
  /** Stress/sleep debt lift (higher => more resistant and higher baseline). */
  stressLoadMgdl: number;
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
export const DEMO_RUN_DIP_DEPTH = 24;

export function getDemoDayProfile(ymd: string, seed: string): DemoDayProfile {
  const rng = mulberry32(hashString(`${seed}|dayprof|${ymd}`));
  const weekend = calendarYmdIsWeekend(ymd);

  // Mix sedentary and active days so the glucose-vs-steps scatter has realistic spread.
  const stepBin = hashString(`${seed}|stepbin|${ymd}`) % 100;
  let dailySteps: number;
  if (stepBin < 30) {
    dailySteps = Math.round(2200 + rng() * 3200); // ~2.2k–5.4k
  } else if (stepBin < 67) {
    dailySteps = Math.round(5600 + rng() * 3300); // ~5.6k–8.9k
  } else {
    dailySteps = Math.round(9000 + rng() * 5200); // ~9k–14.2k
  }
  const stepsGlucoseShift = -clamp((dailySteps - 7000) / 260, -26, 12);

  const sensitivityRoll = hashString(`${seed}|sens|${ymd}`) % 100;
  const insulinSensitivity =
    sensitivityRoll < 15
      ? 0.86 + rng() * 0.06
      : sensitivityRoll < 82
        ? 0.92 + rng() * 0.12
        : 1.01 + rng() * 0.1;

  const carbLoadFactor = 0.98 + rng() * (weekend ? 0.4 : 0.34);
  const stressLoadMgdl = (weekend ? 2.5 : 1) + (hashString(`${seed}|stress|${ymd}`) % 10);
  const weekendGlucoseLift = weekend ? 6 + rng() * 8 : 0;

  const runRng = hashString(`${seed}|run|${ymd}`) % 100;
  const hasDistanceRun = runRng < (weekend ? 42 : 52);

  const swimRoll = hashString(`${seed}|swim|${ymd}`) % 100;
  const hasLongSwim = !hasDistanceRun && swimRoll < (weekend ? 14 : 6);
  const swimPeakHour = weekend ? 9.5 + rng() * 2.2 : 6.8 + rng() * 1.4;
  const swimBumpMgdl = 18 + (hashString(`${seed}|swimb|${ymd}`) % 14);

  return {
    dailySteps,
    stepsGlucoseShift,
    weekendGlucoseLift,
    insulinSensitivity,
    carbLoadFactor,
    stressLoadMgdl,
    hasDistanceRun,
    runDipDepth: DEMO_RUN_DIP_DEPTH,
    hasLongSwim,
    swimPeakHour,
    swimBumpMgdl,
  };
}
