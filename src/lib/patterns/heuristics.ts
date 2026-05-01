import { randomUUID } from "node:crypto";

import type {
  PatternFeatureContext,
  PatternInsightJson,
  SessionStats,
  StepsStats,
} from "@/lib/patterns/types";

function id(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

function clampFrequency(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function dexcomOnly(): string[] {
  return ["Dexcom"];
}

function stepsSources(s: StepsStats): string[] {
  const out = new Set<string>(["Dexcom"]);
  if (s.hasHourlyStepsData) out.add("Apple Steps");
  if (s.stravaWorkoutCount > 0) out.add("Strava");
  if (s.manualWorkoutCount > 0) out.add("Manual workouts");
  return [...out];
}

function sessionSources(sess: SessionStats): string[] {
  const out = new Set<string>(["Dexcom"]);
  if (sess.stravaWorkoutCount > 0) out.add("Strava");
  if (sess.manualWorkoutCount > 0) out.add("Manual workouts");
  return [...out];
}

function hourLabel12(h: number): string {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

function capitalizePhrase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** e.g. "Glucose higher in evenings than mornings" from morning/afternoon/evening means. */
function comparativePartOfDayBandsTitle(
  morning: number | null,
  afternoon: number | null,
  evening: number | null,
): string | null {
  const bands: { label: string; v: number }[] = [];
  if (morning != null) bands.push({ label: "mornings", v: morning });
  if (afternoon != null) bands.push({ label: "afternoons", v: afternoon });
  if (evening != null) bands.push({ label: "evenings", v: evening });
  if (bands.length < 2) return null;
  let hi = bands[0]!;
  let lo = bands[0]!;
  for (const b of bands) {
    if (b.v > hi.v) hi = b;
    if (b.v < lo.v) lo = b;
  }
  if (hi.label === lo.label) return null;
  return `Glucose higher in ${capitalizePhrase(hi.label)} than ${capitalizePhrase(lo.label)}`;
}

function comparativeAfternoonNightTitle(
  afternoon: number | null,
  night: number | null,
): string | null {
  if (afternoon == null || night == null) return null;
  if (afternoon > night) return "Glucose higher in afternoons than overnight";
  if (night > afternoon) return "Glucose higher overnight than in afternoons";
  return "Afternoon vs overnight glucose similar on average";
}

function milesFromMeters(m: number | null): string | null {
  if (m == null || m <= 0) return null;
  return (m / 1609.34).toFixed(1);
}

/** Typed patterns: Temporal (BG/time), Steps (BG/step count), Sessions (BG/activity). */
export function buildHeuristicPatterns(ctx: PatternFeatureContext): PatternInsightJson[] {
  const temporal: PatternInsightJson[] = [];
  const stepsOut: PatternInsightJson[] = [];
  const sessionsOut: PatternInsightJson[] = [];

  const t = ctx.temporal;
  const st = ctx.steps;
  const s = ctx.sessions;

  const minReadingsTemporal = Math.max(24, ctx.windowDays * 3);

  if (ctx.glucoseReadingsCount < minReadingsTemporal) {
    temporal.push({
      id: id("temporal-sparse"),
      title: "Limited CGM coverage for time-of-day splits",
      description: `${ctx.glucoseReadingsCount} Dexcom readings in this window — sync regularly or choose a longer range for morning/afternoon/evening and weekday patterns.`,
      type: "Temporal",
      confidencePercent: clampFrequency(38 + Math.min(35, ctx.glucoseReadingsCount)),
      linkedSources: dexcomOnly(),
    });
  } else if (
    t.peakHour != null &&
    t.troughHour != null &&
    t.peakMeanMgdl != null &&
    t.troughMeanMgdl != null &&
    t.peakHour !== t.troughHour
  ) {
    const pk = t.hourSampleCount[t.peakHour] ?? 0;
    const tr = t.hourSampleCount[t.troughHour] ?? 0;
    temporal.push({
      id: id("temporal-peak-trough"),
      title: `Glucose higher around ${hourLabel12(t.peakHour)} than around ${hourLabel12(t.troughHour)}`,
      description: `Highest average ~${Math.round(t.peakMeanMgdl)} mg/dL around ${hourLabel12(t.peakHour)} (${pk} samples that hour); lowest ~${Math.round(t.troughMeanMgdl)} mg/dL around ${hourLabel12(t.troughHour)} (${tr} samples).`,
      type: "Temporal",
      confidencePercent: clampFrequency(62 + Math.min(28, Math.min(pk, tr))),
      linkedSources: dexcomOnly(),
    });
  }

  if (
    ctx.glucoseReadingsCount >= minReadingsTemporal &&
    t.weekdayMeanMgdl != null &&
    t.weekendMeanMgdl != null
  ) {
    temporal.push({
      id: id("temporal-weekday-weekend"),
      title:
        t.weekendMeanMgdl > t.weekdayMeanMgdl
          ? "Glucose higher on weekends than weekdays"
          : t.weekdayMeanMgdl > t.weekendMeanMgdl
            ? "Glucose higher on weekdays than weekends"
            : "Weekend and weekday glucose similar on average",
      description: `Average glucose ~${Math.round(t.weekdayMeanMgdl)} mg/dL on weekdays vs ~${Math.round(t.weekendMeanMgdl)} mg/dL on weekends (${t.weekdaySampleCount} weekday vs ${t.weekendSampleCount} weekend CGM samples).`,
      type: "Temporal",
      confidencePercent: 66,
      linkedSources: dexcomOnly(),
    });
  }

  if (
    ctx.glucoseReadingsCount >= minReadingsTemporal &&
    t.eveningHigh630to21DaysCount >= 1
  ) {
    temporal.push({
      id: id("temporal-evening-630"),
      title: `Glucose above target on ${t.eveningHigh630to21DaysCount} evenings (6–9pm)`,
      description: `You've had readings above ${ctx.targetHighMgdl} mg/dL between 6pm–9pm on ${t.eveningHigh630to21DaysCount} of the last ${ctx.windowDays} local days. This could be due to under-bolusing for dinner or late-night snacking — use consistent timing with your clinician.`,
      type: "Temporal",
      confidencePercent: clampFrequency(
        55 + Math.min(35, t.eveningHigh630to21DaysCount * 8),
      ),
      linkedSources: dexcomOnly(),
    });
  }

  if (
    ctx.glucoseReadingsCount >= minReadingsTemporal &&
    t.morningMeanMgdl != null &&
    t.afternoonMeanMgdl != null &&
    t.eveningMeanMgdl != null
  ) {
    temporal.push({
      id: id("temporal-bands"),
      title:
        comparativePartOfDayBandsTitle(
          t.morningMeanMgdl,
          t.afternoonMeanMgdl,
          t.eveningMeanMgdl,
        ) ?? "Glucose varies by part of day",
      description: `Morning (6am–11am) ~${Math.round(t.morningMeanMgdl)} mg/dL; afternoon (noon–5pm) ~${Math.round(t.afternoonMeanMgdl)} mg/dL; evening (6pm–11pm) ~${Math.round(t.eveningMeanMgdl)} mg/dL (local time).`,
      type: "Temporal",
      confidencePercent: 68,
      linkedSources: dexcomOnly(),
    });
  }

  if (
    ctx.glucoseReadingsCount >= minReadingsTemporal &&
    t.afternoonMeanMgdl != null &&
    t.nightMeanMgdl != null
  ) {
    temporal.push({
      id: id("temporal-afternoon-night"),
      title:
        comparativeAfternoonNightTitle(t.afternoonMeanMgdl, t.nightMeanMgdl) ??
        "Afternoon vs overnight glucose",
      description: `Afternoon ~${Math.round(t.afternoonMeanMgdl)} mg/dL vs overnight (midnight–5am) ~${Math.round(t.nightMeanMgdl)} mg/dL.`,
      type: "Temporal",
      confidencePercent: 62,
      linkedSources: dexcomOnly(),
    });
  }

  if (!temporal.length) {
    temporal.push({
      id: id("temporal-none"),
      title: "Temporal patterns need denser CGM",
      description:
        "Once Dexcom covers more local hours, morning/afternoon/evening and weekday splits will fill in.",
      type: "Temporal",
      confidencePercent: 40,
      linkedSources: dexcomOnly(),
    });
  }

  if (st.daysWithStepsAndGlucose < 4) {
    stepsOut.push({
      id: id("steps-sparse"),
      title: "High- vs low-step days need more overlap",
      description: `${st.daysWithStepsAndGlucose} day(s) had hourly steps and enough CGM — add a few more to compare step volume with daily glucose.`,
      type: "Steps",
      confidencePercent: 45,
      linkedSources: stepsSources(st),
    });
  } else if (
    st.meanDailyMgdlHighStepDays != null &&
    st.meanDailyMgdlLowStepDays != null &&
    st.medianDailySteps != null
  ) {
    const highHigher =
      st.meanDailyMgdlHighStepDays > st.meanDailyMgdlLowStepDays;
    const assoc = highHigher
      ? "Higher-step days line up with higher average glucose in this window."
      : "Higher-step days are associated with lower average glucose.";
    stepsOut.push({
      id: id("steps-split"),
      title: highHigher
        ? "Glucose higher on high-step days than low-step days"
        : "Glucose lower on high-step days than low-step days",
      description: `${assoc} Split at ~${Math.round(st.medianDailySteps).toLocaleString()} steps/day (median): ~${Math.round(st.meanDailyMgdlHighStepDays)} mg/dL on ${st.daysHighStepBucket} higher-step day(s) vs ~${Math.round(st.meanDailyMgdlLowStepDays)} mg/dL on ${st.daysLowStepBucket} lower-step day(s).`,
      type: "Steps",
      confidencePercent: clampFrequency(58 + Math.min(30, st.daysWithStepsAndGlucose * 2)),
      linkedSources: stepsSources(st),
    });
  }

  if (st.avgDailySteps != null) {
    stepsOut.push({
      id: id("steps-level"),
      title: "Average daily steps",
      description: `~${st.avgDailySteps.toLocaleString()} steps/day where hourly data exists (goal ${st.stepsGoalPerDay.toLocaleString()}).`,
      type: "Steps",
      confidencePercent: 52,
      linkedSources: stepsSources(st),
    });
  } else {
    stepsOut.push({
      id: id("steps-none"),
      title: "No hourly step ingests",
      description:
        "Send hourly steps (e.g. Apple Shortcuts) to relate movement volume to glucose.",
      type: "Steps",
      confidencePercent: 44,
      linkedSources: dexcomOnly(),
    });
  }

  if (s.workoutStartsCount === 0) {
    sessionsOut.push({
      id: id("sess-none"),
      title: "No activity sessions in this window",
      description:
        "Connect Strava or log manual workouts to analyze glucose response around sessions (type, duration, distance, response window).",
      type: "Sessions",
      confidencePercent: 48,
      linkedSources: sessionSources(s),
    });
  } else if (
    s.runLikeSessionsWithDelta >= 2 &&
    s.avgMgdlDeltaRunLike != null
  ) {
    const mi = milesFromMeters(s.avgDistanceMetersRunLike);
    const dur =
      s.avgDurationMinutesRunLike != null
        ? `${Math.round(s.avgDurationMinutesRunLike)} min`
        : "variable duration";
    const deltaRounded = Math.round(s.avgMgdlDeltaRunLike);
    const titleDelta =
      deltaRounded < 0
        ? `Glucose drops ~${Math.abs(deltaRounded)} mg/dL around logged sessions`
        : deltaRounded > 0
          ? `Glucose rises ~${deltaRounded} mg/dL around logged sessions`
          : "Glucose change around logged sessions";
    sessionsOut.push({
      id: id("sess-run-delta"),
      title: titleDelta,
      description: `Across ${s.runLikeSessionsWithDelta} sessions with enough CGM in the 90min before vs the response window after start (${dur} avg where recorded${mi ? `, ~${mi} mi avg distance` : ""}), mean change during vs before was about ${deltaRounded > 0 ? "+" : ""}${deltaRounded} mg/dL. Negative values indicate a drop.`,
      type: "Sessions",
      confidencePercent: clampFrequency(68 + Math.min(22, s.runLikeSessionsWithDelta)),
      linkedSources: sessionSources(s),
    });
  }

  if (
    s.meanMgdlNearWorkout2h != null &&
    s.meanMgdlAwayFromWorkout2h != null
  ) {
    sessionsOut.push({
      id: id("sess-proximity"),
      title: "Glucose near session starts vs elsewhere",
      description: `${s.workoutStartsCount} session start(s): ~${Math.round(s.meanMgdlNearWorkout2h)} mg/dL within ±2h of a start (${s.readingsNearWorkout2h} readings) vs ~${Math.round(s.meanMgdlAwayFromWorkout2h)} mg/dL outside (${s.readingsAwayFromWorkout2h} readings).`,
      type: "Sessions",
      confidencePercent: clampFrequency(62 + Math.min(25, s.workoutStartsCount * 2)),
      linkedSources: sessionSources(s),
    });
  } else if (s.workoutStartsCount > 0 && s.runLikeSessionsWithDelta < 2) {
    sessionsOut.push({
      id: id("sess-thin"),
      title: "Sessions logged; CGM sparse in response windows",
      description: `${s.workoutStartsCount} start(s) in range — need more CGM before and during the post-start window to estimate per-session glucose change.`,
      type: "Sessions",
      confidencePercent: 46,
      linkedSources: sessionSources(s),
    });
  }

  return [...temporal, ...stepsOut, ...sessionsOut];
}
