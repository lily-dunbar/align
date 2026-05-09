"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

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
  const pathname = usePathname();
  const isDemoRoute = pathname.startsWith("/demo");
  const resolvedDateYmd = useResolvedDayYmd(dateYmd);
  const effectiveTz = useEffectiveTimeZone();
  const [data, setData] = useState<DaySummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setError(null);
    try {
      const resp = await fetch(
        `/api/day?date=${encodeURIComponent(resolvedDateYmd)}&timeZone=${encodeURIComponent(effectiveTz)}${isDemoRoute ? "&demo=1" : ""}`,
        { cache: "no-store" },
      );
      const json = (await resp.json()) as DaySummaryResponse & { error?: string };
      if (!resp.ok) throw new Error(json.error ?? "Failed to load day summary");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [resolvedDateYmd, effectiveTz, isDemoRoute]);

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
      <section className="w-full rounded-2xl border border-white/70 bg-[linear-gradient(135deg,rgba(221,234,229,0.78)_0%,rgba(212,227,246,0.8)_52%,rgba(243,245,235,0.78)_100%)] p-3 text-left text-sm text-zinc-700 shadow-[0_8px_18px_-16px_rgba(35,84,92,0.3)] ring-1 ring-black/[0.025]">
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
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
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
