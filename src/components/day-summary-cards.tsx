"use client";

import { useCallback, useEffect, useState } from "react";

import { AlignMetricCard } from "@/components/align-metric-card";
import { DaySummaryCardsSkeleton } from "@/components/skeleton";
import { useEffectiveTimeZone } from "@/hooks/use-effective-timezone";
import { DAY_DATA_CHANGED_EVENT } from "@/lib/day-view-events";
import { useResolvedDayYmd } from "@/lib/use-resolved-day-ymd";

type DaySummaryResponse = {
  targets?: {
    lowMgdl: number;
    highMgdl: number;
    tirGoalPercent: number;
    stepsGoalPerDay: number;
  };
  aggregates: {
    tir: {
      inRangePercent: number;
      targetLowMgdl?: number;
      targetHighMgdl?: number;
    };
    avgGlucoseMgdl: number | null;
    totalSteps: number;
  };
};

type Props = {
  dateYmd: string;
};

export function DaySummaryCards({ dateYmd }: Props) {
  const resolvedDateYmd = useResolvedDayYmd(dateYmd);
  const effectiveTz = useEffectiveTimeZone();
  const [data, setData] = useState<DaySummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setError(null);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
      const resp = await fetch(
        `/api/day?date=${encodeURIComponent(resolvedDateYmd)}&timeZone=${encodeURIComponent(tz)}`,
        { cache: "no-store" },
      );
      const json = (await resp.json()) as DaySummaryResponse & { error?: string };
      if (!resp.ok) throw new Error(json.error ?? "Failed to load day summary");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [resolvedDateYmd, effectiveTz]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void loadSummary();
    });
    return () => cancelAnimationFrame(id);
  }, [loadSummary]);

  useEffect(() => {
    function onDayDataChanged() {
      void loadSummary();
    }
    window.addEventListener(DAY_DATA_CHANGED_EVENT, onDayDataChanged);
    return () => {
      window.removeEventListener(DAY_DATA_CHANGED_EVENT, onDayDataChanged);
    };
  }, [loadSummary]);

  if (error) {
    return (
      <section className="w-full rounded-lg border border-red-200 bg-red-50 p-3 text-left text-sm text-red-700">
        Summary load error: {error}
      </section>
    );
  }

  if (!data) {
    return <DaySummaryCardsSkeleton />;
  }

  const tirActual = data.aggregates.tir.inRangePercent;
  const tirGoal = data.targets?.tirGoalPercent;
  const lowMgdl =
    data.targets?.lowMgdl ?? data.aggregates.tir.targetLowMgdl ?? null;
  const highMgdl =
    data.targets?.highMgdl ?? data.aggregates.tir.targetHighMgdl ?? null;
  const tirSubtitle =
    lowMgdl != null && highMgdl != null
      ? `Between ${lowMgdl} and ${highMgdl} mg/dL`
      : tirGoal != null
        ? tirActual >= tirGoal
          ? `At or above goal (${tirGoal}%)`
          : `Below goal (${tirGoal}%)`
        : undefined;

  const steps = data.aggregates.totalSteps;
  const stepGoal = data.targets?.stepsGoalPerDay;
  const stepsSubtitle =
    stepGoal != null && stepGoal > 0
      ? `${Math.min(100, Math.round((steps / stepGoal) * 100))}% of ${stepGoal.toLocaleString()} goal`
      : undefined;

  return (
    <section className="w-full">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-align-muted">Day summary</h2>
      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <AlignMetricCard
          variant="glucose"
          title="Avg glucose"
          value={
            data.aggregates.avgGlucoseMgdl === null ? "—" : `${data.aggregates.avgGlucoseMgdl}`
          }
          valueUnit={data.aggregates.avgGlucoseMgdl === null ? undefined : "mg/dL"}
        />
        <AlignMetricCard variant="tir" title="TIR" value={`${tirActual.toFixed(1)}%`} subtitle={tirSubtitle} />
        <AlignMetricCard
          variant="steps"
          title="Total steps"
          value={steps.toLocaleString()}
          subtitle={stepsSubtitle}
        />
      </div>
    </section>
  );
}
