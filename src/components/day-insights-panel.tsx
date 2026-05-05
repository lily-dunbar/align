"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react";

import { DayInsightsListSkeleton } from "@/components/skeleton";
import { useEffectiveTimeZone } from "@/hooks/use-effective-timezone";
import { DAY_DATA_CHANGED_EVENT } from "@/lib/day-view-events";
import {
  clearDayInsightsSessionCache,
  dayInsightsSessionKey,
  readDayInsightsSessionCache,
  writeDayInsightsSessionCache,
  type DayInsightsCacheablePayload,
} from "@/lib/day-insights-session-cache";
import { useResolvedDayYmd } from "@/lib/use-resolved-day-ymd";

type InsightsResponse = DayInsightsCacheablePayload & {
  ok?: boolean;
  unchanged?: boolean;
  digest?: string;
  error?: string;
};

const DEBOUNCE_MS = 700;

function cacheablePayloadFromResponse(json: InsightsResponse): DayInsightsCacheablePayload {
  return {
    ok: json.ok,
    source: json.source,
    insights: json.insights,
    message: json.message,
    generatedAt: json.generatedAt,
    date: json.date,
    timeZone: json.timeZone,
  };
}

type Props = {
  dateYmd: string;
};

export function DayInsightsPanel({ dateYmd }: Props) {
  const { userId } = useAuth();
  const resolvedDateYmd = useResolvedDayYmd(dateYmd);
  const effectiveTz = useEffectiveTimeZone();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InsightsResponse | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cacheKey = dayInsightsSessionKey(userId ?? null, resolvedDateYmd, effectiveTz);

  const runFetch = useCallback(async () => {
    const cached = readDayInsightsSessionCache(cacheKey);
    const hasWarmCache = Boolean(cached?.payload?.insights?.length);

    if (hasWarmCache && cached) {
      setData(cached.payload as InsightsResponse);
    }
    if (!hasWarmCache) {
      setLoading(true);
    }
    setError(null);

    try {
      const qs = new URLSearchParams({
        date: resolvedDateYmd,
        timeZone: effectiveTz,
      });
      if (cached?.digest) {
        qs.set("sinceDigest", cached.digest);
      }

      const resp = await fetch(`/api/day/insights?${qs.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = (await resp.json()) as InsightsResponse;
      if (!resp.ok) {
        throw new Error(json.error ?? "Insights request failed");
      }

      if (json.unchanged && cached) {
        setData(cached.payload as InsightsResponse);
        return;
      }

      setData(json);
      if (json.digest && !json.error) {
        writeDayInsightsSessionCache(cacheKey, {
          digest: json.digest,
          payload: cacheablePayloadFromResponse(json),
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Insights failed");
      if (!hasWarmCache) {
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }, [resolvedDateYmd, effectiveTz, cacheKey]);

  const scheduleFetch = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void runFetch();
    }, DEBOUNCE_MS);
  }, [runFetch]);

  /** Hydrate from session cache on next microtask — debounced fetch then revalidates. */
  useEffect(() => {
    queueMicrotask(() => {
      const cached = readDayInsightsSessionCache(cacheKey);
      if (cached?.payload?.insights?.length) {
        setData(cached.payload as InsightsResponse);
        setLoading(false);
      }
    });
    scheduleFetch();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [cacheKey, scheduleFetch]);

  useEffect(() => {
    function onDayDataChanged() {
      clearDayInsightsSessionCache(cacheKey);
      setData(null);
      setError(null);
      scheduleFetch();
    }
    window.addEventListener(DAY_DATA_CHANGED_EVENT, onDayDataChanged);
    return () => window.removeEventListener(DAY_DATA_CHANGED_EVENT, onDayDataChanged);
  }, [scheduleFetch, cacheKey]);

  let subtitle: string | null = null;
  if (data?.generatedAt) {
    try {
      subtitle = new Date(data.generatedAt).toLocaleString();
    } catch {
      subtitle = data.generatedAt;
    }
  }

  const sourceBadge =
    loading && !data?.insights?.length ? (
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
