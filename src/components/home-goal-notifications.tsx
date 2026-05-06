"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";

import { useEffectiveTimeZone } from "@/hooks/use-effective-timezone";
import { DAY_DATA_CHANGED_EVENT } from "@/lib/day-view-events";
import { useResolvedDayYmd } from "@/lib/use-resolved-day-ymd";

type Props = {
  dateYmd: string;
};

type DaySummaryResponse = {
  targets?: {
    tirGoalPercent: number;
    stepsGoalPerDay: number;
  };
  aggregates: {
    tir: {
      inRangePercent: number;
    };
    totalSteps: number;
  };
};

type InsightDigestResponse = {
  ok?: boolean;
  digest?: string;
};

type Notice = {
  id: "steps-goal" | "tir-goal" | "new-insight";
  title: string;
  body: string;
};

function dismissedKey(dateYmd: string, id: Notice["id"]) {
  return `align:home-notice:dismissed:${dateYmd}:${id}`;
}

function insightDigestKey(dateYmd: string) {
  return `align:home-notice:last-insight-digest:${dateYmd}`;
}

export function HomeGoalNotifications({ dateYmd }: Props) {
  const resolvedDateYmd = useResolvedDayYmd(dateYmd);
  const effectiveTz = useEffectiveTimeZone();
  const { user } = useUser();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [insightDigest, setInsightDigest] = useState<string | null>(null);
  const firstName = user?.firstName?.trim() ?? "";
  const cheerPrefix = firstName ? `Nice job, ${firstName}!` : "Nice job!";

  const dismiss = useCallback(
    (id: Notice["id"]) => {
      setNotices((prev) => prev.filter((n) => n.id !== id));
      try {
        localStorage.setItem(dismissedKey(resolvedDateYmd, id), "1");
        if (id === "new-insight" && insightDigest) {
          localStorage.setItem(insightDigestKey(resolvedDateYmd), insightDigest);
        }
      } catch {
        // Ignore storage failures.
      }
    },
    [resolvedDateYmd, insightDigest],
  );

  const load = useCallback(async () => {
    try {
      const [dayResp, insightResp] = await Promise.all([
        fetch(
          `/api/day?date=${encodeURIComponent(resolvedDateYmd)}&timeZone=${encodeURIComponent(effectiveTz)}`,
          {
            cache: "no-store",
          },
        ),
        fetch(
          `/api/day/insights?date=${encodeURIComponent(resolvedDateYmd)}&timeZone=${encodeURIComponent(effectiveTz)}`,
          {
            cache: "no-store",
          },
        ),
      ]);
      if (!dayResp.ok) return;

      const dayJson = (await dayResp.json()) as DaySummaryResponse;
      const insightJson = insightResp.ok
        ? ((await insightResp.json()) as InsightDigestResponse)
        : ({} as InsightDigestResponse);
      const nextDigest = insightJson.digest ?? null;
      setInsightDigest(nextDigest);

      const next: Notice[] = [];
      const stepsGoal = dayJson.targets?.stepsGoalPerDay ?? 0;
      const tirGoal = dayJson.targets?.tirGoalPercent ?? 0;
      const totalSteps = dayJson.aggregates.totalSteps ?? 0;
      const tirActual = dayJson.aggregates.tir?.inRangePercent ?? 0;

      const isStepsReached = stepsGoal > 0 && totalSteps >= stepsGoal;
      if (isStepsReached) {
        next.push({
          id: "steps-goal",
          title: "Steps goal met",
          body: `${cheerPrefix} You met your step goal for the day (${totalSteps.toLocaleString()} steps).`,
        });
      }

      const isTirReached = tirGoal > 0 && tirActual >= tirGoal;
      if (isTirReached) {
        next.push({
          id: "tir-goal",
          title: "TIR goal met",
          body: `${cheerPrefix} You hit your TIR target with ${tirActual.toFixed(1)}% in range.`,
        });
      }

      if (nextDigest) {
        let previousDigest = "";
        try {
          previousDigest = localStorage.getItem(insightDigestKey(resolvedDateYmd)) ?? "";
        } catch {
          previousDigest = "";
        }
        if (previousDigest && previousDigest !== nextDigest) {
          next.push({
            id: "new-insight",
            title: "New insight available",
            body: `${firstName ? `${firstName}, ` : ""}new data came in and your insights just refreshed.`,
          });
        }
      }

      const visible = next.filter((n) => {
        try {
          return localStorage.getItem(dismissedKey(resolvedDateYmd, n.id)) !== "1";
        } catch {
          return true;
        }
      });
      setNotices(visible);
    } catch {
      // Ignore errors. This is an enhancement-only layer.
    }
  }, [resolvedDateYmd, effectiveTz, cheerPrefix, firstName]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onDayDataChanged() {
      void load();
    }
    window.addEventListener(DAY_DATA_CHANGED_EVENT, onDayDataChanged);
    return () => {
      window.removeEventListener(DAY_DATA_CHANGED_EVENT, onDayDataChanged);
    };
  }, [load]);

  const firstNotice = useMemo(() => notices[0] ?? null, [notices]);
  if (!firstNotice) return null;

  return (
    <section className="w-full rounded-2xl border border-white/70 bg-[linear-gradient(135deg,rgba(221,234,229,0.78)_0%,rgba(212,227,246,0.8)_52%,rgba(243,245,235,0.78)_100%)] px-4 py-3 shadow-[0_8px_18px_-16px_rgba(35,84,92,0.3)] ring-1 ring-black/[0.025]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4f8481]">Update</p>
          <h3 className="mt-0.5 text-sm font-semibold tracking-tight text-zinc-900">{firstNotice.title}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-600">{firstNotice.body}</p>
        </div>
        <button
          type="button"
          onClick={() => dismiss(firstNotice.id)}
          className="shrink-0 rounded-full border border-zinc-300/75 bg-white/75 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-white"
        >
          Dismiss
        </button>
      </div>
    </section>
  );
}

