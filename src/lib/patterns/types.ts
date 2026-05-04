/** Query / URL value for pattern range filters. */
export type PatternWindow = "7d" | "30d" | "90d";

/**
 * Pattern taxonomy (cards):
 * - **Temporal** — glucose vs time of day / calendar
 * - **Sessions** — glucose vs logged workouts (~2h around starts, longer-run deltas)
 * - **Steps** — **day-level** movement vs mean glucose (e.g. days over a step threshold); not raw hourly step curves
 */
export type PatternTypeLabel = "Temporal" | "Steps" | "Sessions";

/** Structured chart data for “Learn more” on a pattern card (all from server-computed stats). */
export type PatternEvidenceChart =
  | {
      kind: "hour_of_day";
      /** One point per clock hour 0–23 (local); null = not enough samples that hour. */
      points: { hour: number; meanMgdl: number | null }[];
      /** Optional [startHour, endHour] bands to shade (e.g. morning vs evening). */
      shadeRanges?: [number, number][];
    }
  | {
      kind: "scatter_steps_mgdl";
      points: { ymd: string; steps: number; meanMgdl: number }[];
      thresholdSteps: number;
    }
  | {
      kind: "bars_session_delta";
      items: { label: string; deltaMgdl: number; startYmd?: string }[];
    }
  | {
      kind: "two_bar";
      left: { label: string; valueMgdl: number };
      right: { label: string; valueMgdl: number };
    }
  | { kind: "empty" };

export type PatternLearnMore = {
  /** Plain-language steps Align took (no medical advice). */
  explanation: string;
  /** Window line for context. */
  windowSummary: string;
  /** Sample calendar dates backing the pattern (local), newest last. */
  contributingDaysYmd: string[];
  /** How to read the sample vs totals. */
  contributingNote: string;
  chart: PatternEvidenceChart;
};

/** One surfaced pattern — stable JSON for UI and API clients. */
export type PatternInsightJson = {
  id: string;
  title: string;
  description: string;
  type: PatternTypeLabel;
  /** Confidence score (0–100); compared to pattern threshold in settings; list is sorted by this descending. */
  confidencePercent: number;
  linkedSources: string[];
  learnMore?: PatternLearnMore;
};

/** Hour-of-day + weekday Dexcom aggregates in the user’s zone. */
export type TemporalStats = {
  readingsUsed: number;
  hourMeanMgdl: (number | null)[];
  hourSampleCount: number[];
  peakHour: number | null;
  troughHour: number | null;
  peakMeanMgdl: number | null;
  troughMeanMgdl: number | null;
  morningMeanMgdl: number | null;
  afternoonMeanMgdl: number | null;
  eveningMeanMgdl: number | null;
  nightMeanMgdl: number | null;
  /** Per-reading means (weekday Mon–Fri vs Sat–Sun local). */
  weekdayMeanMgdl: number | null;
  weekendMeanMgdl: number | null;
  weekdaySampleCount: number;
  weekendSampleCount: number;
  /** Local days with Dexcom glucose high (> target) between 6–9pm. */
  eveningHigh630to21DaysCount: number;
  /** Local 6–9pm (18:00–21:59) mean from Dexcom; pair with morningMeanMgdl for evening vs morning. */
  dinnerEveningMeanMgdl: number | null;
  /** dinnerEveningMeanMgdl minus morningMeanMgdl when both exist. */
  dinnerEveningVsMorningDeltaMgdl: number | null;
};

/** Dexcom glucose vs daily steps. */
export type StepsStats = {
  daysWithStepsAndGlucose: number;
  medianDailySteps: number | null;
  meanDailyMgdlHighStepDays: number | null;
  meanDailyMgdlLowStepDays: number | null;
  daysHighStepBucket: number;
  daysLowStepBucket: number;
  avgDailySteps: number | null;
  stepsGoalPerDay: number;
  hasHourlyStepsData: boolean;
  stravaWorkoutCount: number;
  manualWorkoutCount: number;
  /** Threshold for “more active day” vs “less active” (same unit as daily totals). */
  activeDayStepsThreshold: number;
  daysMeanMgdlStepsGteThreshold: number;
  daysMeanMgdlStepsLtThreshold: number;
  meanDailyMgdlStepsGteThreshold: number | null;
  meanDailyMgdlStepsLtThreshold: number | null;
  /** Mean BG on below-threshold days minus mean on ≥threshold days (positive ⇒ quieter days run higher). */
  meanMgdlDeltaLessActiveMinusActive: number | null;
};

/** Dexcom glucose vs logged workouts (~2h around session starts). */
export type SessionStats = {
  workoutStartsCount: number;
  stravaWorkoutCount: number;
  manualWorkoutCount: number;
  readingsNearWorkout2h: number;
  readingsAwayFromWorkout2h: number;
  meanMgdlNearWorkout2h: number | null;
  meanMgdlAwayFromWorkout2h: number | null;
  /** Run-like sessions with enough Dexcom data before vs during to estimate Δ glucose */
  runLikeSessionsWithDelta: number;
  avgMgdlDeltaRunLike: number | null;
  avgDistanceMetersRunLike: number | null;
  avgDurationMinutesRunLike: number | null;
  dominantRunLikeLabel: string | null;
  /** Runs / run-like sessions at least this long in miles (for long-run Δ stats). */
  longRunMilesThreshold: number;
  runLikeSessionsDeltaOverLongRunMi: number;
  avgMgdlDeltaRunLikeOverLongRunMi: number | null;
  deltaMgdlP25LongRunMi: number | null;
  deltaMgdlP75LongRunMi: number | null;
};

/** Row counts plus a plain-language hint for Temporal vs Sessions insights (steps still in JSON for other uses). */
export type PatternDataCoverage = {
  glucoseReadingsCount: number;
  hourlyStepBucketsCount: number;
  manualWorkoutsCount: number;
  stravaActivitiesCount: number;
  /** Plain-language reminder for cross-domain comparison. */
  analysisHint: string;
};

/** Local-calendar coverage for the rolling patterns window (for UI disclosure). */
export type PatternWindowInclusion = {
  /** Inclusive start of range in `timeZone`, `YYYY-MM-DD`. */
  rangeStartYmd: string;
  /** Inclusive end of range in `timeZone`, `YYYY-MM-DD`. */
  rangeEndYmd: string;
  /** Distinct local days with ≥1 Dexcom glucose reading. */
  daysWithCgm: number;
  /** Distinct local days with total steps &gt; 0. */
  daysWithSteps: number;
  /** Manual workouts + Strava activities with start time in the window. */
  activitiesCount: number;
};

/** Per-workout glucose change (during vs ~90 min before), for charts. */
export type PatternSessionDeltaPoint = {
  deltaMgdl: number;
  distanceMeters: number | null;
  label: string;
  /** Local calendar date of workout start. */
  startYmd: string;
};

/** Days with both step totals and enough Dexcom data for a daily mean (pattern stats). */
export type PatternDailyGlucoseStepsPoint = {
  ymd: string;
  meanMgdl: number;
  steps: number;
};

export type PatternEvidenceBundle = {
  dailyGlucoseSteps: PatternDailyGlucoseStepsPoint[];
  sessionDeltas: PatternSessionDeltaPoint[];
  /** Sample of local days with any Dexcom data (for disclosure lists). */
  cgmDaysSample: string[];
};

export type PatternFeatureContext = {
  windowDays: number;
  calendarDaysInWindow: number;
  glucoseReadingsCount: number;
  meanMgdl: number | null;
  tirInRangePercent: number | null;
  tirGoalPercent: number;
  targetLowMgdl: number;
  targetHighMgdl: number;
  temporal: TemporalStats;
  steps: StepsStats;
  sessions: SessionStats;
  dataCoverage: PatternDataCoverage;
  inclusion: PatternWindowInclusion;
  evidence: PatternEvidenceBundle;
};

export type PatternsFeatureJson = {
  window: PatternWindow;
  range: {
    startUtc: string;
    endUtcExclusive: string;
    labelDays: number;
  };
  timeZone: string;
  patternThresholdPercent: number;
  generatedAt: string;
  source: "anthropic" | "heuristic" | "demo";
  patterns: PatternInsightJson[];
  featureContext: PatternFeatureContext;
};
