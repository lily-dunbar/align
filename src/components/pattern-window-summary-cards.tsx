import type {
  PatternPeriodSummary,
  PatternWindowSummaryResult,
} from "@/lib/patterns/window-summaries";

function Card({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string | null;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{title}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">{value}</p>
      {subtitle ? (
        <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
      ) : null}
    </div>
  );
}

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
      ? `No CGM data in ${priorPhrase(labelDays)} for comparison`
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
      ? `No CGM data in ${priorPhrase(labelDays)} for comparison`
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
    cur.avgGlucoseMgdl === null ? "—" : `${cur.avgGlucoseMgdl} mg/dL`;
  const tirValue =
    cur.tirInRangePercent === null ? "—" : `${cur.tirInRangePercent.toFixed(1)}%`;
  const stepsValue = cur.avgStepsPerDay.toLocaleString();

  return (
    <section className="w-full">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card
          title="Avg glucose"
          value={glucoseValue}
          subtitle={glucoseDeltaSubtitle(cur, prev, labelDays)}
        />
        <Card title="TIR" value={tirValue} subtitle={tirDeltaSubtitle(cur, prev, labelDays)} />
        <Card
          title="Avg steps / day"
          value={stepsValue}
          subtitle={stepsDeltaSubtitle(cur, prev, labelDays)}
        />
      </div>
    </section>
  );
}
