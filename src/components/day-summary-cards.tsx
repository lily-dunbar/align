"use client";

import { useCallback, useEffect, useState } from "react";

import { DAY_DATA_CHANGED_EVENT } from "@/lib/day-view-events";

type DaySummaryResponse = {
  targets?: {
    tirGoalPercent: number;
    stepsGoalPerDay: number;
  };
  aggregates: {
    tir: {
      inRangePercent: number;
    };
    avgGlucoseMgdl: number | null;
    totalSteps: number;
  };
};

type Props = {
  dateYmd: string;
};

function Card({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{title}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">{value}</p>
      {subtitle ? <p className="mt-1 text-xs text-zinc-500">{subtitle}</p> : null}
    </div>
  );
}

export function DaySummaryCards({ dateYmd }: Props) {
  const [data, setData] = useState<DaySummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setError(null);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
      const resp = await fetch(
        `/api/day?date=${encodeURIComponent(dateYmd)}&timeZone=${encodeURIComponent(tz)}`,
        { cache: "no-store" },
      );
      const json = (await resp.json()) as DaySummaryResponse & { error?: string };
      if (!resp.ok) throw new Error(json.error ?? "Failed to load day summary");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [dateYmd]);

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
    return (
      <section className="w-full rounded-lg border p-3 text-left text-sm text-zinc-600">
        Loading summary…
      </section>
    );
  }

  const tirActual = data.aggregates.tir.inRangePercent;
  const tirGoal = data.targets?.tirGoalPercent;
  const tirSubtitle =
    tirGoal != null
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
      <div className="grid gap-3 sm:grid-cols-3">
        <Card
          title="Avg glucose"
          value={
            data.aggregates.avgGlucoseMgdl === null
              ? "—"
              : `${data.aggregates.avgGlucoseMgdl} mg/dL`
          }
        />
        <Card title="TIR" value={`${tirActual.toFixed(1)}%`} subtitle={tirSubtitle} />
        <Card
          title="Total steps"
          value={steps.toLocaleString()}
          subtitle={stepsSubtitle}
        />
      </div>
    </section>
  );
}
