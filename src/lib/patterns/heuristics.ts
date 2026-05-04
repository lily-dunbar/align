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

function sessionSources(sess: SessionStats): string[] {
  const out = new Set<string>(["Dexcom"]);
  if (sess.stravaWorkoutCount > 0) out.add("Strava");
  if (sess.manualWorkoutCount > 0) out.add("Manual workouts");
  return [...out];
}

function stepSources(st: StepsStats): string[] {
  const out = ["Dexcom"];
  if (st.hasHourlyStepsData) out.push("Apple Steps");
  return out;
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

/** Title completes “Your glucose ___” without saying “Your glucose.” */
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
  return `Higher in ${capitalizePhrase(hi.label)} than ${capitalizePhrase(lo.label)}`;
}

function comparativeAfternoonNightTitle(
  afternoon: number | null,
  night: number | null,
): string | null {
  if (afternoon == null || night == null) return null;
  if (afternoon > night) return "Higher in afternoons than overnight";
  if (night > afternoon) return "Higher overnight than in afternoons";
  return "Afternoons and overnight look similar on average";
}

function milesFromMeters(m: number | null): string | null {
  if (m == null || m <= 0) return null;
  return (m / 1609.34).toFixed(1);
}

type LongRunDirection = "drop" | "rise" | "flat";

/**
 * During-minus-before delta for long runs: direction from average; span always uses
 * positive magnitudes for drops/rises (never "-14–12" with the wrong verb).
 */
function longRunDeltaSpanLabel(args: {
  avgMgdl: number;
  p25: number | null;
  p75: number | null;
  usePercentiles: boolean;
}): { direction: LongRunDirection; spanLabel: string; absAvg: number } {
  const avgR = Math.round(args.avgMgdl);
  const direction: LongRunDirection = avgR < 0 ? "drop" : avgR > 0 ? "rise" : "flat";
  const absAvg = Math.abs(avgR);

  if (args.usePercentiles && args.p25 != null && args.p75 != null) {
    const lo = Math.min(Math.round(args.p25), Math.round(args.p75));
    const hi = Math.max(Math.round(args.p25), Math.round(args.p75));

    if (direction === "drop" && hi <= 0) {
      const m1 = Math.abs(lo);
      const m2 = Math.abs(hi);
      const lowMag = Math.min(m1, m2);
      const highMag = Math.max(m1, m2);
      return {
        direction,
        spanLabel: lowMag === highMag ? `${lowMag}` : `${lowMag}–${highMag}`,
        absAvg,
      };
    }
    if (direction === "rise" && lo >= 0) {
      return {
        direction,
        spanLabel: lo === hi ? `${lo}` : `${lo}–${hi}`,
        absAvg,
      };
    }
  }

  return { direction, spanLabel: `${absAvg}`, absAvg };
}

/** Short card title; numbers live in the description. */
function longRunCondensedTitle(direction: LongRunDirection, absAvg: number): string {
  if (direction === "flat") return "Mixed BG change on longer runs";
  const slight = absAvg < 16;
  const moderate = absAvg < 40;
  if (direction === "drop") {
    if (slight) return "Slight BG drop on runs";
    if (moderate) return "BG drop on longer runs";
    return "Large BG drop on runs";
  }
  if (slight) return "Slight BG rise on runs";
  if (moderate) return "BG rise on longer runs";
  return "Large BG rise on runs";
}

function longRunBodyDescription(args: {
  direction: LongRunDirection;
  spanLabel: string;
  miThreshold: number;
}): string {
  const { direction, spanLabel, miThreshold } = args;
  if (direction === "flat") {
    return `On logged runs over about ${miThreshold} mi, glucose during the session vs the ~90 minutes before start was mixed this window—more workouts will clarify. Fueling and insulin on board still matter; discuss with your clinician if needed.`;
  }
  const verb = direction === "drop" ? "drop" : "rise";
  return `Blood sugars tend to ${verb} by about ${spanLabel} mg/dL on runs over ${miThreshold} mi in this window (Dexcom during the workout vs roughly the 90 minutes before you start). Effort, food, and insulin on board all shape what you see—use this as context, not a rule, and check with your clinician if it surprises you.`;
}

/** Typed patterns: Temporal, Sessions, Steps (day-level movement vs glucose). */
export function buildHeuristicPatterns(ctx: PatternFeatureContext): PatternInsightJson[] {
  const temporal: PatternInsightJson[] = [];
  const sessionsOut: PatternInsightJson[] = [];
  const stepsOut: PatternInsightJson[] = [];

  const t = ctx.temporal;
  const s = ctx.sessions;
  const st = ctx.steps;

  const minReadingsTemporal = Math.max(24, ctx.windowDays * 3);
  const MIN_EFFECT_MGDL = 8;

  if (ctx.glucoseReadingsCount < minReadingsTemporal) {
    temporal.push({
      id: id("temporal-sparse"),
      title: "Still gathering enough Dexcom data to compare times of day",
      description:
        "Coverage is light for this stretch — sync more steadily or pick a longer window, and clearer morning-vs-evening contrasts will emerge. Low confidence until then.",
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
    temporal.push({
      id: id("temporal-peak-trough"),
      title: `Higher around ${hourLabel12(t.peakHour)} than around ${hourLabel12(t.troughHour)}`,
      description: `Across this window, the stretch around ${hourLabel12(t.peakHour)} tends to sit above the stretch around ${hourLabel12(
        t.troughHour,
      )} — meals, sleep, or stress timing may be part of the story.`,
      type: "Temporal",
      confidencePercent: clampFrequency(72 + Math.min(16, ctx.windowDays)),
      linkedSources: dexcomOnly(),
    });
  }

  if (
    ctx.glucoseReadingsCount >= minReadingsTemporal &&
    t.weekdayMeanMgdl != null &&
    t.weekendMeanMgdl != null
  ) {
    const weekendHigher = t.weekendMeanMgdl > t.weekdayMeanMgdl;
    const weekdayHigher = t.weekdayMeanMgdl > t.weekendMeanMgdl;
    temporal.push({
      id: id("temporal-weekday-weekend"),
      title: weekendHigher
        ? "Runs higher on weekends than weekdays"
        : weekdayHigher
          ? "Runs higher on weekdays than weekends"
          : "Weekends and weekdays look similar overall",
      description: weekendHigher || weekdayHigher
        ? "The week’s shape and the weekend’s shape don’t match — routine, sleep, or social meals could be worth a look with your clinician if this lines up with how you feel."
        : "You’re not seeing a big split between weekdays and weekends here — still worth noticing if that ever shifts.",
      type: "Temporal",
      confidencePercent: 66,
      linkedSources: dexcomOnly(),
    });
  }

  if (ctx.glucoseReadingsCount >= minReadingsTemporal && t.eveningHigh630to21DaysCount >= 1) {
    temporal.push({
      id: id("temporal-evening-630"),
      title: "Often above target in the early evening",
      description: `Several recent days show a bump after dinner hours — timing of meals or snacks could be one piece; worth discussing with your care team if it’s bothersome.`,
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
        ) ?? "Shifts between morning, afternoon, and evening",
      description:
        "Mornings, afternoons, and evenings don’t line up the same — the clearest gap is between your higher stretch and your lower one. Could reflect meal timing or how busy the day is.",
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
        "Afternoon vs overnight",
      description:
        "Afternoons and the overnight stretch aren’t behaving the same — worth noticing if sleep or late meals might be nudging the curve.",
      type: "Temporal",
      confidencePercent: 62,
      linkedSources: dexcomOnly(),
    });
  }

  if (
    ctx.glucoseReadingsCount >= minReadingsTemporal &&
    t.dinnerEveningVsMorningDeltaMgdl != null &&
    Math.abs(t.dinnerEveningVsMorningDeltaMgdl) >= MIN_EFFECT_MGDL
  ) {
    const d = Math.round(t.dinnerEveningVsMorningDeltaMgdl);
    const mag = Math.abs(d);
    temporal.unshift({
      id: id("temporal-dinner-morning"),
      title:
        d > 0
          ? `Often ~${mag} mg/dL higher between 6–9pm than mornings`
          : `Often ~${mag} mg/dL lower between 6–9pm than mornings`,
      description: `Across this window, Dexcom data from about 6–9pm averages roughly ${mag} mg/dL ${
        d > 0 ? "above" : "below"
      } readings from about 6–11am (local) — dinner timing, basal patterns, or day stress may play a role.`,
      type: "Temporal",
      confidencePercent: clampFrequency(76 + Math.min(14, ctx.windowDays)),
      linkedSources: dexcomOnly(),
    });
  }

  if (!temporal.length) {
    temporal.push({
      id: id("temporal-none"),
      title: "Time-of-day patterns need denser Dexcom data",
      description:
        "Once readings cover more hours, morning, afternoon, and evening contrasts will be easier to trust.",
      type: "Temporal",
      confidencePercent: 40,
      linkedSources: dexcomOnly(),
    });
  }

  if (
    s.runLikeSessionsDeltaOverLongRunMi >= 2 &&
    s.avgMgdlDeltaRunLikeOverLongRunMi != null
  ) {
    const usePercentiles =
      s.deltaMgdlP25LongRunMi != null &&
      s.deltaMgdlP75LongRunMi != null &&
      s.runLikeSessionsDeltaOverLongRunMi >= 3;
    const { direction, spanLabel, absAvg } = longRunDeltaSpanLabel({
      avgMgdl: s.avgMgdlDeltaRunLikeOverLongRunMi,
      p25: s.deltaMgdlP25LongRunMi,
      p75: s.deltaMgdlP75LongRunMi,
      usePercentiles,
    });
    sessionsOut.unshift({
      id: id("sess-longrun-delta"),
      title: longRunCondensedTitle(direction, absAvg),
      description: longRunBodyDescription({
        direction,
        spanLabel,
        miThreshold: s.longRunMilesThreshold,
      }),
      type: "Sessions",
      confidencePercent: clampFrequency(74 + Math.min(18, s.runLikeSessionsDeltaOverLongRunMi * 3)),
      linkedSources: sessionSources(s),
    });
  }

  if (s.workoutStartsCount === 0) {
    sessionsOut.push({
      id: id("sess-none"),
      title: "No workouts in this window yet",
      description:
        "Log a few sessions (Strava or manual) to see whether glucose tends to shift within a couple hours of when you start moving.",
      type: "Sessions",
      confidencePercent: 48,
      linkedSources: sessionSources(s),
    });
  } else if (s.runLikeSessionsWithDelta >= 2 && s.avgMgdlDeltaRunLike != null) {
    const mi = milesFromMeters(s.avgDistanceMetersRunLike);
    const deltaRounded = Math.round(s.avgMgdlDeltaRunLike);
    const titleDelta =
      deltaRounded < 0
        ? "Often dips within a couple hours of a workout"
        : deltaRounded > 0
          ? "Often rises within a couple hours of a workout"
          : "Little average shift right around workout starts";
    const miPhrase = mi ? ` Typical distance in this mix is around ${mi} mi.` : "";
    sessionsOut.push({
      id: id("sess-run-delta"),
      title: titleDelta,
      description: `Among runs and ride-like sessions, Dexcom data in the couple of hours around a start tends to be ${
        deltaRounded < 0 ? "softer" : deltaRounded > 0 ? "higher" : "flat"
      } than just before — effort, adrenaline, or food timing may play a role.${miPhrase} Discuss with your clinician if it surprises you.`,
      type: "Sessions",
      confidencePercent: clampFrequency(68 + Math.min(22, s.runLikeSessionsWithDelta)),
      linkedSources: sessionSources(s),
    });
  }

  if (s.meanMgdlNearWorkout2h != null && s.meanMgdlAwayFromWorkout2h != null) {
    const nearHigher = s.meanMgdlNearWorkout2h > s.meanMgdlAwayFromWorkout2h;
    sessionsOut.push({
      id: id("sess-proximity"),
      title: nearHigher ? "Higher near workout starts than the rest of the day" : "Lower near workout starts than the rest of the day",
      description:
        "Glucose looks different within a couple hours of when you start moving versus other times — patterns vary person to person; more logs will help confirm whether this is real for you.",
      type: "Sessions",
      confidencePercent: clampFrequency(62 + Math.min(25, s.workoutStartsCount * 2)),
      linkedSources: sessionSources(s),
    });
  } else if (s.workoutStartsCount > 0 && s.runLikeSessionsWithDelta < 2) {
    sessionsOut.push({
      id: id("sess-thin"),
      title: "Workouts are logged; Dexcom data around them is still sparse",
      description:
        "It’s a small effect so far — a few more days with readings near session starts will help confirm whether movement really shifts your curve.",
      type: "Sessions",
      confidencePercent: 46,
      linkedSources: sessionSources(s),
    });
  }

  if (
    st.meanMgdlDeltaLessActiveMinusActive != null &&
    Math.abs(st.meanMgdlDeltaLessActiveMinusActive) >= MIN_EFFECT_MGDL &&
    st.meanDailyMgdlStepsGteThreshold != null &&
    st.meanDailyMgdlStepsLtThreshold != null &&
    st.daysMeanMgdlStepsGteThreshold >= 3 &&
    st.daysMeanMgdlStepsLtThreshold >= 3
  ) {
    const mag = Math.round(Math.abs(st.meanMgdlDeltaLessActiveMinusActive));
    const activeDaysLower = st.meanMgdlDeltaLessActiveMinusActive > 0;
    stepsOut.push({
      id: id("steps-threshold"),
      title: activeDaysLower
        ? `Often ~${mag} mg/dL lower on days over ${st.activeDayStepsThreshold.toLocaleString()} steps`
        : `Often ~${mag} mg/dL higher on days over ${st.activeDayStepsThreshold.toLocaleString()} steps`,
      description: activeDaysLower
        ? `Daily averages: Dexcom data runs lower on days at or above about ${st.activeDayStepsThreshold.toLocaleString()} steps than on quieter days in this stretch — many factors differ day to day, but the split is sizable here.`
        : `Daily averages: Dexcom data runs higher on days at or above about ${st.activeDayStepsThreshold.toLocaleString()} steps than on quieter days — unusual but worth flagging with your care team if it fits your experience.`,
      type: "Steps",
      confidencePercent: clampFrequency(
        66 + Math.min(18, st.daysMeanMgdlStepsGteThreshold + st.daysMeanMgdlStepsLtThreshold),
      ),
      linkedSources: stepSources(st),
    });
  }

  return [...temporal, ...sessionsOut, ...stepsOut];
}
