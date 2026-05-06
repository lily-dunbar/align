"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";

import { DayInsightsListSkeleton } from "@/components/skeleton";
import { useEffectiveTimeZone } from "@/hooks/use-effective-timezone";
import { metersToMilesDisplay } from "@/lib/distance-units";
import { DAY_DATA_CHANGED_EVENT } from "@/lib/day-view-events";
import { useResolvedDayYmd } from "@/lib/use-resolved-day-ymd";

type DayResponse = {
  day: {
    timeZone: string;
  };
  streams: {
    glucose: Array<{ observedAt: string; mgdl: number }>;
    manualWorkouts: Array<{
      id: string;
      startedAt: string;
      endedAt: string | null;
      workoutType?: string | null;
      durationMin?: number | null;
      distanceMeters?: number | null;
    }>;
    stravaActivities: Array<{
      id: string;
      startAt: string;
      endAt: string | null;
      durationSec?: number | null;
      activityType?: string | null;
      sportType?: string | null;
      distanceMeters?: number | null;
    }>;
    foodEntries: Array<{
      id: string;
      eatenAt: string;
      title: string;
    }>;
    sleepWindows: Array<{
      id: string;
      sleepStart: string;
      sleepEnd: string;
    }>;
  };
  error?: string;
};

type Props = {
  dateYmd: string;
};

type ActivityKind = "manual" | "strava" | "food" | "sleep";

type ActivityItem = {
  id: string;
  kind: ActivityKind;
  title: string;
  startIso: string;
  endIso: string;
  durationMin: number;
  bgDeltaMgdl: number | null;
  /** Manual workouts and Strava only — miles displayed when greater than zero */
  distanceMeters?: number | null;
};

const KIND_LABEL: Record<ActivityKind, string> = {
  manual: "Manual",
  strava: "Strava",
  food: "Food",
  sleep: "Sleep",
};

/** Matches `daily-view-chart` ReferenceArea fills: activity #f9a8a4, food #EFF1CD, sleep #DAE6E5 */
const KIND_BADGE_CLASS: Record<ActivityKind, string> = {
  manual:
    "border border-[color:rgb(249_168_164_/_0.45)] bg-[color:rgb(249_168_164_/_0.22)] text-[#9a3412]",
  strava:
    "border border-[color:rgb(249_168_164_/_0.45)] bg-[color:rgb(249_168_164_/_0.22)] text-[#9a3412]",
  food: "border border-[color:rgb(212_225_150_/_0.55)] bg-[#EFF1CD] text-[#3f6212]",
  sleep:
    "border border-[color:rgb(148_187_182_/_0.55)] bg-[color:rgb(218_230_229_/_0.92)] text-[#115e59]",
};

function durationMinutes(startIso: string, endIso: string) {
  const s = new Date(startIso).getTime();
  const e = new Date(endIso).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;
  return Math.max(0, Math.round((e - s) / 60000));
}

function addMinutes(iso: string, minutes: number) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  return new Date(t + minutes * 60_000).toISOString();
}

function foodWindowMinutes(title: string) {
  const t = title.toLowerCase();
  if (t.includes("low impact")) return 30;
  if (t.includes("fast acting")) return 60;
  if (t.includes("med acting")) return 120;
  if (t.includes("slow acting")) return 180;
  if (/snack|fruit|yogurt|apple|cracker|bar\b/.test(t)) return 60;
  if (/pasta|burger|fried|burrito|lasagna|rice bowl|pizza/.test(t)) return 150;
  return 120;
}

function nearestGlucoseMgdl(
  glucose: Array<{ observedAt: string; mgdl: number }>,
  targetIso: string,
  withinMinutes = 45,
) {
  const target = new Date(targetIso).getTime();
  if (!Number.isFinite(target)) return null;
  const maxMs = withinMinutes * 60_000;
  let best: { mgdl: number; dist: number } | null = null;
  for (const g of glucose) {
    const t = new Date(g.observedAt).getTime();
    if (!Number.isFinite(t)) continue;
    const dist = Math.abs(t - target);
    if (dist > maxMs) continue;
    if (!best || dist < best.dist) best = { mgdl: g.mgdl, dist };
  }
  return best?.mgdl ?? null;
}

function bgDeltaForWindow(
  glucose: Array<{ observedAt: string; mgdl: number }>,
  startIso: string,
  endIso: string,
) {
  const start = nearestGlucoseMgdl(glucose, startIso);
  const end = nearestGlucoseMgdl(glucose, endIso);
  if (start == null || end == null) return null;
  return Math.round(end - start);
}

function formatClockInZone(iso: string, timeZone: string) {
  try {
    return formatInTimeZone(new Date(iso), timeZone, "h:mm a");
  } catch {
    return "—";
  }
}

function formatTimeRangeLocal(startIso: string, endIso: string, timeZone: string) {
  return `${formatClockInZone(startIso, timeZone)} – ${formatClockInZone(endIso, timeZone)}`;
}

function formatDuration(min: number) {
  if (!Number.isFinite(min) || min <= 0) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Matches manual entry + aggregates — US miles, one decimal */
function formatDistanceMi(meters: number): string {
  const mi = metersToMilesDisplay(meters, 1);
  return `${mi} mi`;
}

type BgDeltaTone = "up" | "down" | "flat" | "unknown";

function bgDeltaMeta(delta: number | null): {
  tone: BgDeltaTone;
  shortLabel: string;
  ariaLabel: string;
} {
  if (delta == null) {
    return {
      tone: "unknown",
      shortLabel: "—",
      ariaLabel: "Glucose change unavailable — no CGM readings near start and end of this window",
    };
  }
  if (delta === 0) {
    return {
      tone: "flat",
      shortLabel: "0",
      ariaLabel: "Glucose unchanged across this window",
    };
  }
  if (delta > 0) {
    return {
      tone: "up",
      shortLabel: `+${delta}`,
      ariaLabel: `Glucose up ${delta} milligrams per deciliter across this window`,
    };
  }
  return {
    tone: "down",
    shortLabel: `${delta}`,
    ariaLabel: `Glucose down ${Math.abs(delta)} milligrams per deciliter across this window`,
  };
}

/** Local clock span for this event */
function IconCalendar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth={1.35}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5a2.25 2.25 0 002.25-2.25m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5a2.25 2.25 0 012.25 2.25v7.5"
      />
    </svg>
  );
}

/** Elapsed duration */
function IconClock({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function IconRoute({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 13L9 7"
      />
    </svg>
  );
}

function IconArrowUp({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 15.75l7.5-7.5 7.5 7.5"
      />
    </svg>
  );
}

function IconArrowDown({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 8.25l-7.5 7.5-7.5-7.5"
      />
    </svg>
  );
}

function IconMinus({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path stroke="currentColor" strokeWidth={2} strokeLinecap="round" d="M5 12h14" />
    </svg>
  );
}

function IconHelp({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
      />
    </svg>
  );
}

const BG_DELTA_CHIP_CLASS: Record<BgDeltaTone, string> = {
  up: "border-rose-200/90 bg-rose-50 text-rose-900 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)]",
  down:
    "border-emerald-200/90 bg-emerald-50 text-emerald-900 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)]",
  flat: "border-zinc-200/90 bg-zinc-50 text-zinc-700",
  unknown: "border-dashed border-zinc-300/90 bg-zinc-50/90 text-zinc-600",
};

function BgDeltaChip({ delta }: { delta: number | null }) {
  const meta = bgDeltaMeta(delta);
  const Icon =
    meta.tone === "up"
      ? IconArrowUp
      : meta.tone === "down"
        ? IconArrowDown
        : meta.tone === "flat"
          ? IconMinus
          : IconHelp;

  return (
    <div
      role="group"
      aria-label={meta.ariaLabel}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium leading-none ${BG_DELTA_CHIP_CLASS[meta.tone]}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
      <span className="tabular-nums tracking-tight">
        {meta.tone === "unknown" ? (
          <span>No CGM delta</span>
        ) : meta.tone === "flat" ? (
          <span>
            BG <span className="font-normal text-zinc-500">flat</span>
          </span>
        ) : (
          <span>
            <span className="font-semibold">{meta.shortLabel}</span>
            <span className="font-normal text-current/80"> mg/dL</span>
          </span>
        )}
      </span>
    </div>
  );
}

/** Left accent on cards — mirrors chart band hues */
const KIND_ACCENT_CLASS: Record<ActivityKind, string> = {
  manual: "border-l-4 border-l-[#f9a8a4]",
  strava: "border-l-4 border-l-[#f9a8a4]",
  food: "border-l-4 border-l-[#c8d87a]",
  sleep: "border-l-4 border-l-[#94b8b3]",
};

export function DayInsightsPanel({ dateYmd }: Props) {
  const { userId, isLoaded } = useAuth();
  const resolvedDateYmd = useResolvedDayYmd(dateYmd);
  const effectiveTz = useEffectiveTimeZone();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DayResponse | null>(null);

  const runFetch = useCallback(async () => {
    if (!isLoaded || !userId) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        date: resolvedDateYmd,
        timeZone: effectiveTz,
      });
      const resp = await fetch(`/api/day?${qs.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = (await resp.json()) as DayResponse;
      if (!resp.ok) {
        throw new Error(json.error ?? "Could not load activities");
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load activities");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [resolvedDateYmd, effectiveTz, userId, isLoaded]);

  useEffect(() => {
    void runFetch();
  }, [runFetch]);

  useEffect(() => {
    function onDayDataChanged() {
      void runFetch();
    }
    window.addEventListener(DAY_DATA_CHANGED_EVENT, onDayDataChanged);
    return () => window.removeEventListener(DAY_DATA_CHANGED_EVENT, onDayDataChanged);
  }, [runFetch]);

  const activities = useMemo<ActivityItem[]>(() => {
    if (!data) return [];
    const glucose = data.streams.glucose;

    const manual = data.streams.manualWorkouts.map((w) => {
      const fallbackEnd = addMinutes(w.startedAt, w.durationMin ?? 30);
      const endIso = w.endedAt ?? fallbackEnd;
      return {
        id: `manual-${w.id}`,
        kind: "manual" as const,
        title: w.workoutType?.trim() || "Workout",
        startIso: w.startedAt,
        endIso,
        durationMin: w.durationMin ?? durationMinutes(w.startedAt, endIso),
        bgDeltaMgdl: bgDeltaForWindow(glucose, w.startedAt, endIso),
        distanceMeters: w.distanceMeters ?? null,
      };
    });

    const strava = data.streams.stravaActivities.map((a) => {
      const endIso =
        a.endAt ?? addMinutes(a.startAt, Math.round((a.durationSec ?? 1800) / 60));
      const label = a.sportType?.trim() || a.activityType?.trim() || "Activity";
      return {
        id: `strava-${a.id}`,
        kind: "strava" as const,
        title: label,
        startIso: a.startAt,
        endIso,
        durationMin: a.durationSec
          ? Math.max(1, Math.round(a.durationSec / 60))
          : durationMinutes(a.startAt, endIso),
        bgDeltaMgdl: bgDeltaForWindow(glucose, a.startAt, endIso),
        distanceMeters: a.distanceMeters ?? null,
      };
    });

    const food = data.streams.foodEntries.map((f) => {
      const minutes = foodWindowMinutes(f.title);
      const endIso = addMinutes(f.eatenAt, minutes);
      return {
        id: `food-${f.id}`,
        kind: "food" as const,
        title: f.title.trim() || "Food",
        startIso: f.eatenAt,
        endIso,
        durationMin: minutes,
        bgDeltaMgdl: bgDeltaForWindow(glucose, f.eatenAt, endIso),
      };
    });

    const sleep = data.streams.sleepWindows.map((s) => ({
      id: `sleep-${s.id}`,
      kind: "sleep" as const,
      title: "Sleep",
      startIso: s.sleepStart,
      endIso: s.sleepEnd,
      durationMin: durationMinutes(s.sleepStart, s.sleepEnd),
      bgDeltaMgdl: bgDeltaForWindow(glucose, s.sleepStart, s.sleepEnd),
    }));

    return [...manual, ...strava, ...food, ...sleep].sort(
      (a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime(),
    );
  }, [data]);

  const timeZone = data?.day.timeZone ?? effectiveTz;

  if (!isLoaded) {
    return (
      <section
        className="w-full rounded-2xl border border-align-border/90 bg-white/90 p-5 ring-1 ring-black/[0.03] backdrop-blur-[2px] md:p-6"
        aria-busy
      >
        <h2 className="text-base font-semibold tracking-tight text-foreground">Day overview</h2>
        <DayInsightsListSkeleton />
      </section>
    );
  }

  if (!userId) {
    return null;
  }

  return (
    <section
      className="w-full rounded-2xl border border-align-border/90 bg-white/90 p-5 ring-1 ring-black/[0.03] backdrop-blur-[2px] md:p-6"
      aria-busy={loading}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="min-w-0 text-base font-semibold tracking-tight text-foreground">
          Day overview
        </h2>
        <span className="rounded-full bg-align-nav-active px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-align-forest">
          {loading ? "Loading…" : `${activities.length} ${activities.length === 1 ? "event" : "events"}`}
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
        Glucose change compares the nearest CGM readings to the start and end of each window (arrows = direction). If you
        see “No CGM delta,” there weren’t readings close enough to both times.
      </p>

      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading && !activities.length ? <DayInsightsListSkeleton /> : null}

      {activities.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {activities.map((item) => (
            <li
              key={item.id}
              className={`overflow-hidden rounded-xl border border-align-border/70 bg-gradient-to-br from-white to-align-subtle/40 shadow-sm shadow-black/[0.04] ring-1 ring-black/[0.04] transition hover:border-align-border/90 hover:shadow-md ${KIND_ACCENT_CLASS[item.kind]}`}
            >
              <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KIND_BADGE_CLASS[item.kind]}`}
                    >
                      {KIND_LABEL[item.kind]}
                    </span>
                    <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-align-forest">
                      {item.title}
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-50/90 px-2.5 py-1.5 text-xs text-zinc-800 ring-1 ring-black/[0.05]">
                      <IconCalendar className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                      <span className="font-medium">{formatTimeRangeLocal(item.startIso, item.endIso, timeZone)}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-50/90 px-2.5 py-1.5 text-xs text-zinc-800 ring-1 ring-black/[0.05]">
                      <IconClock className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                      <span className="font-medium">{formatDuration(item.durationMin)}</span>
                    </span>
                    {(item.kind === "manual" || item.kind === "strava") &&
                    item.distanceMeters != null &&
                    item.distanceMeters > 0 ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-50/90 px-2.5 py-1.5 text-xs text-zinc-800 ring-1 ring-black/[0.05]">
                        <IconRoute className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
                        <span className="font-medium tabular-nums">{formatDistanceMi(item.distanceMeters)}</span>
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="shrink-0 sm:max-w-[11rem] sm:pt-0.5">
                  <BgDeltaChip delta={item.bgDeltaMgdl} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : !loading && !error ? (
        <p className="mt-3 text-sm text-zinc-500">
          Nothing logged for this day yet. Add a workout or meal above, or connect Strava — events will show here in time
          order.
        </p>
      ) : null}
    </section>
  );
}
