/** Query / URL value for pattern range filters. */
export type PatternWindow = "7d" | "30d" | "90d";

/**
 * Pattern taxonomy:
 * - **Temporal** — BG vs clock (morning/afternoon/evening, weekday vs weekend)
 * - **Steps** — BG vs daily step volume (high- vs low-step days)
 * - **Sessions** — BG vs logged workouts (type, duration, distance, response window)
 */
export type PatternTypeLabel = "Temporal" | "Steps" | "Sessions";

/** One surfaced pattern — stable JSON for UI and API clients. */
export type PatternInsightJson = {
  id: string;
  title: string;
  description: string;
  type: PatternTypeLabel;
  /** Confidence score (0–100); compared to pattern threshold in settings; list is sorted by this descending. */
  confidencePercent: number;
  linkedSources: string[];
};

/** Hour-of-day + weekday CGM aggregates in the user’s zone. */
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
  /** Local days with any CGM high (> target) between 6–9pm. */
  eveningHigh630to21DaysCount: number;
};

/** CGM vs daily steps. */
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
};

/** CGM vs activity sessions (before/during response windows). */
export type SessionStats = {
  workoutStartsCount: number;
  stravaWorkoutCount: number;
  manualWorkoutCount: number;
  readingsNearWorkout2h: number;
  readingsAwayFromWorkout2h: number;
  meanMgdlNearWorkout2h: number | null;
  meanMgdlAwayFromWorkout2h: number | null;
  /** Run-like sessions with enough CGM before vs during to estimate Δ glucose */
  runLikeSessionsWithDelta: number;
  avgMgdlDeltaRunLike: number | null;
  avgDistanceMetersRunLike: number | null;
  avgDurationMinutesRunLike: number | null;
  dominantRunLikeLabel: string | null;
};

/** Row counts + guidance so the model explicitly ties insights to BG, steps, and activity. */
export type PatternDataCoverage = {
  glucoseReadingsCount: number;
  hourlyStepBucketsCount: number;
  manualWorkoutsCount: number;
  stravaActivitiesCount: number;
  /** Plain-language reminder for cross-domain comparison. */
  analysisHint: string;
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
  source: "anthropic" | "heuristic";
  patterns: PatternInsightJson[];
  featureContext: PatternFeatureContext;
};
