import { AlignMetricCard } from "@/components/align-metric-card";
import type {
  PatternPeriodSummary,
  PatternWindowSummaryResult,
} from "@/lib/patterns/window-summaries";

function priorPhrase(labelDays: number): string {
  return labelDays === 1 ? "prior day" : `prior ${labelDays} days`;
}

function glucoseDeltaSubtitle(
  cur: PatternPeriodSummary,
  prev: PatternPeriodSummary,
  labelDays: number,
): string | null {
  if (cur.avgGlucoseMgdl == null || prev.avgGlucoseMgdl == null) {
    if (cur.glucoseReadingsCount === 0) return null;
    return prev.glucoseReadingsCount === 0
      ? `No Dexcom data in ${priorPhrase(labelDays)} for comparison`
      : null;
  }
  const d = cur.avgGlucoseMgdl - prev.avgGlucoseMgdl;
  const arrow = d < 0 ? "↓" : d > 0 ? "↑" : "→";
  const num = `${d > 0 ? "+" : ""}${Math.round(d)}`;
  return `${arrow} ${num} mg/dL vs ${priorPhrase(labelDays)}`;
}

function tirDeltaSubtitle(
  cur: PatternPeriodSummary,
  prev: PatternPeriodSummary,
  labelDays: number,
): string | null {
  if (cur.tirInRangePercent == null || prev.tirInRangePercent == null) {
    if (cur.glucoseReadingsCount === 0) return null;
    return prev.glucoseReadingsCount === 0
      ? `No Dexcom data in ${priorPhrase(labelDays)} for comparison`
      : null;
  }
  const d = cur.tirInRangePercent - prev.tirInRangePercent;
  const arrow = d < 0 ? "↓" : d > 0 ? "↑" : "→";
  const num = `${d > 0 ? "+" : ""}${d.toFixed(1)}`;
  return `${arrow} ${num} pts vs ${priorPhrase(labelDays)}`;
}

function stepsDeltaSubtitle(
  cur: PatternPeriodSummary,
  prev: PatternPeriodSummary,
  labelDays: number,
): string {
  const d = cur.avgStepsPerDay - prev.avgStepsPerDay;
  const arrow = d < 0 ? "↓" : d > 0 ? "↑" : "→";
  const mag = Math.abs(d).toLocaleString();
  const num =
    d === 0 ? "0" : `${d > 0 ? "+" : "−"}${mag}`;
  return `${arrow} ${num} steps/day vs ${priorPhrase(labelDays)}`;
}

export function PatternWindowSummaryCards({
  data,
}: {
  data: PatternWindowSummaryResult;
}) {
  const { current: cur, previous: prev, labelDays } = data;

  const glucoseValue =
    cur.avgGlucoseMgdl === null ? "—" : `${cur.avgGlucoseMgdl}`;
  const glucoseUnit = cur.avgGlucoseMgdl === null ? undefined : "mg/dL";
  const tirValue =
    cur.tirInRangePercent === null ? "—" : `${cur.tirInRangePercent.toFixed(1)}%`;
  const stepsValue = cur.avgStepsPerDay.toLocaleString();

  return (
    <section className="w-full">
      <div className="grid gap-3 sm:grid-cols-3">
        <AlignMetricCard
          variant="glucose"
          title="Avg glucose"
          value={glucoseValue}
          valueUnit={glucoseUnit}
          subtitle={glucoseDeltaSubtitle(cur, prev, labelDays)}
        />
        <AlignMetricCard variant="tir" title="TIR" value={tirValue} subtitle={tirDeltaSubtitle(cur, prev, labelDays)} />
        <AlignMetricCard
          variant="steps"
          title="Avg steps / day"
          value={stepsValue}
          subtitle={stepsDeltaSubtitle(cur, prev, labelDays)}
        />
      </div>
    </section>
  );
}
