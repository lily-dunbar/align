"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { DayInsightsListSkeleton } from "@/components/skeleton";
import { DAY_DATA_CHANGED_EVENT } from "@/lib/day-view-events";
import { useResolvedDayYmd } from "@/lib/use-resolved-day-ymd";

type InsightItem = { title: string; detail: string };

type InsightsResponse = {
  ok?: boolean;
  source?: "anthropic" | "spark" | "demo";
  insights?: InsightItem[];
  message?: string;
  error?: string;
  generatedAt?: string;
};

const DEBOUNCE_MS = 700;

type Props = {
  dateYmd: string;
};

export function DayInsightsPanel({ dateYmd }: Props) {
  const resolvedDateYmd = useResolvedDayYmd(dateYmd);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InsightsResponse | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runFetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
      const resp = await fetch(
        `/api/day/insights?date=${encodeURIComponent(resolvedDateYmd)}&timeZone=${encodeURIComponent(tz)}`,
        { cache: "no-store", credentials: "include" },
      );
      const json = (await resp.json()) as InsightsResponse & { error?: string };
      if (!resp.ok) {
        throw new Error(json.error ?? "Insights request failed");
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Insights failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [resolvedDateYmd]);

  const scheduleFetch = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void runFetch();
    }, DEBOUNCE_MS);
  }, [runFetch]);

  useEffect(() => {
    scheduleFetch();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resolvedDateYmd, scheduleFetch]);

  useEffect(() => {
    function onDayDataChanged() {
      setData(null);
      setError(null);
      scheduleFetch();
    }
    window.addEventListener(DAY_DATA_CHANGED_EVENT, onDayDataChanged);
    return () => window.removeEventListener(DAY_DATA_CHANGED_EVENT, onDayDataChanged);
  }, [scheduleFetch]);

  let subtitle: string | null = null;
  if (data?.generatedAt) {
    try {
      subtitle = new Date(data.generatedAt).toLocaleString();
    } catch {
      subtitle = data.generatedAt;
    }
  }

  const sourceBadge =
    loading ? (
      "Loading…"
    ) : data?.source === "demo" ? (
      "Demo sample"
    ) : data?.source === "spark" ? (
      "Daily note"
    ) : data?.source === "anthropic" ? null : (
      "—"
    );

  return (
    <section
      className="w-full rounded-2xl border border-align-border/90 bg-white/90 p-5 ring-1 ring-black/[0.03] backdrop-blur-[2px] md:p-6"
      aria-busy={loading}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="min-w-0 text-base font-semibold tracking-tight text-foreground">Day insights</h2>
        {sourceBadge != null ? (
          <span className="rounded-full bg-align-nav-active px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-align-forest">
            {sourceBadge}
          </span>
        ) : null}
      </div>
      {subtitle ? (
        <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">Updated {subtitle}</p>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      {data?.message && data.source === "spark" ? (
        <p className="mt-2 text-xs text-zinc-500">{data.message}</p>
      ) : null}

      {loading && !data?.insights?.length ? <DayInsightsListSkeleton /> : null}

      {data?.insights && data.insights.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {data.insights.map((ins, i) => (
            <li
              key={`${ins.title}-${i}`}
              className="rounded-xl border border-align-border/80 bg-align-subtle/80 px-4 py-3 text-sm ring-1 ring-black/[0.02]"
            >
              <p className="font-medium text-align-forest">{ins.title}</p>
              <p className="mt-1.5 leading-relaxed text-zinc-600">{ins.detail}</p>
            </li>
          ))}
        </ul>
      ) : !loading && data && (!data.insights || data.insights.length === 0) ? (
        <p className="mt-3 text-sm text-zinc-500">No insights this time — try again in a moment.</p>
      ) : null}
    </section>
  );
}
