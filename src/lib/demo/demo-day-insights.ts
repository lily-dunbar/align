import type { DayInsightSnapshot } from "@/lib/day-insight-context";
import { formatLocalHour12 } from "@/lib/format-local-hour";

/** Demo-mode day insights with deterministic, data-backed copy (no Claude call). */
export function buildDemoDayInsights(snapshot: DayInsightSnapshot) {
  const { aggregates, targets, hourlyStepsByLocalHour } = snapshot;
  const glucoseTargetMet = aggregates.tirInRangePercent >= targets.tirGoalPercent;
  const topStepHour = hourlyStepsByLocalHour.reduce(
    (best, value, hour) => (value > best.value ? { hour, value } : best),
    { hour: 0, value: 0 },
  );
  const sleepHours = Math.round((aggregates.sleepMinutes / 60) * 10) / 10;

  return [
    {
      title: "Glucose range",
      detail:
        aggregates.avgGlucoseMgdl == null
          ? "CGM data is sparse for this sample day, so range interpretation is limited."
          : `${aggregates.tirInRangePercent.toFixed(1)}% time-in-range (${targets.lowMgdl}-${targets.highMgdl} mg/dL), average ${aggregates.avgGlucoseMgdl} mg/dL. ${
              glucoseTargetMet ? "This meets the daily TIR target." : "This is below the daily TIR target."
            }`,
    },
    {
      title: "Movement pattern",
      detail:
        topStepHour.value > 0
          ? `Peak step hour is around ${formatLocalHour12(topStepHour.hour)} with ${topStepHour.value.toLocaleString()} steps; total is ${aggregates.totalSteps.toLocaleString()} for the day.`
          : `No meaningful steps were logged this day; total is ${aggregates.totalSteps.toLocaleString()}.`,
    },
    {
      title: "Recovery context",
      detail: `Sleep overlap is about ${sleepHours}h. Food entries: ${aggregates.foodEntriesCount} (${Math.round(
        aggregates.foodCarbsGrams,
      )}g carbs). Workouts: ${aggregates.stravaActivitiesCount + aggregates.manualWorkoutsCount}.`,
    },
  ] as const;
}
