"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays } from "date-fns";
import { formatInTimeZone, toDate } from "date-fns-tz";

import { DailyViewChartSkeleton } from "@/components/skeleton";
import { useEffectiveTimeZone } from "@/hooks/use-effective-timezone";
import { DAY_DATA_CHANGED_EVENT } from "@/lib/day-view-events";
import { foodTypeAbsorptionHours, parseFoodTypeTag } from "@/lib/food-type-tag";
import { inferMealPeriodFromLocalTime } from "@/lib/infer-meal-period";
import { getLocalCalendarYmd } from "@/lib/local-calendar-ymd";
import { useResolvedDayYmd } from "@/lib/use-resolved-day-ymd";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

type DayApiResponse = {
  day: {
    timeZone: string;
  };
  aggregates: {
    tir: {
      targetLowMgdl: number;
      targetHighMgdl: number;
    };
  };
  streams: {
    glucose: Array<{ observedAt: string; mgdl: number }>;
    hourlySteps: Array<{ bucketStart: string; stepCount: number }>;
    manualWorkouts: Array<{
      id: string;
      startedAt: string;
      endedAt: string | null;
      workoutType?: string | null;
    }>;
    /** Strava-synced sessions for the day (same layer as manual workouts). */
    stravaActivities?: Array<{
      id: string;
      name?: string | null;
      startAt: string;
      endAt: string | null;
      durationSec: number | null;
      sportType?: string | null;
      activityType?: string | null;
    }>;
    sleepWindows: Array<{ id: string; sleepStart: string; sleepEnd: string }>;
    foodEntries: Array<{ id: string; eatenAt: string; title: string; notes?: string | null }>;
  };
};

type ChartDisplayPreferences = {
  showSteps: boolean;
  showActivity: boolean;
  showSleep: boolean;
  showFood: boolean;
};

/** Full calendar day vs rolling last 12 hours anchored to current time. */
type TimelineWindow = "24h" | "12h";

function timelineDomain24h(): [number, number] {
  return [0, 24];
}

function timelineDomain12h(_viewedYmd: string, timeZone: string, now: Date): [number, number] {
  let end = Math.min(24, toLocalHourFraction(now.toISOString(), timeZone));
  if (end < 1 / 120) {
    end = 1 / 120;
  }
  const start = end - 12;
  return [start, end];
}

function timelineDomain(
  window: TimelineWindow,
  viewedYmd: string,
  timeZone: string,
  now: Date,
): [number, number] {
  if (window === "24h") return timelineDomain24h();
  return timelineDomain12h(viewedYmd, timeZone, now);
}

/** Ticks for full day. */
function timelineTicks24h(): number[] {
  return [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];
}

/** About 6–8 ticks across a (possibly fractional) 12h window. */
function timelineTicks12hRange(xMin: number, xMax: number): number[] {
  const span = xMax - xMin;
  const step =
    span <= 4 ? 1 : span <= 8 ? 2 : span <= 12 ? 2 : span <= 16 ? 3 : 4;
  const ticks: number[] = [];
  let t = Math.ceil((xMin - 1e-9) / step) * step;
  for (; t < xMax - 1e-6; t += step) {
    ticks.push(Number(t.toFixed(4)));
  }
  ticks.push(Number(xMax.toFixed(4)));
  if (ticks[0] > xMin + 0.08) {
    ticks.unshift(Number(xMin.toFixed(4)));
  }
  return [...new Set(ticks)].sort((a, b) => a - b);
}

function timelineTicks(
  window: TimelineWindow,
  domain: [number, number],
): number[] {
  if (window === "24h") return timelineTicks24h();
  return timelineTicks12hRange(domain[0], domain[1]);
}

type ChartRow = {
  xHour: number;
  glucose: number | null;
  steps: number;
  /** Y-axis span for the step bar: floor → top (Recharts bar interval). */
  stepsRange: readonly [number, number];
};

/** Glucose uses ≥ this Y value; step bars fill the band below it on the same scale. */
const GLUCOSE_FLOOR = 52;
const STEP_Y_MIN = 0;
const STEP_Y_MAX = GLUCOSE_FLOOR;
/** Smallest fraction of the step band used when an hour has steps (improves visibility for low counts). */
const STEP_BAR_MIN_FRACTION = 0.14;
const BG_AXIS_TICKS = [60, 120, 180, 240, 300] as const;
const MOBILE_BG_AXIS_WIDTH = 46;

/** Sleep window shading; only overlaps real sleep vs viewed day (handles midnight crossing). */
const SLEEP_BAND_FILL = "#DAE6E5";
const SLEEP_BAND_FILL_OPACITY = 0.38;

/** Food / carb absorption window (local clock) — not persisted; title heuristics only. */
const FOOD_BAND_FILL = "#EFF1CD";
const FOOD_BAND_FILL_OPACITY = 0.4;

/** Rough absorption window for shaded band (hours from first bite). */
function foodAbsorptionDurationHours(title: string, notes?: string | null): number {
  const tagged = parseFoodTypeTag(notes);
  if (tagged) return foodTypeAbsorptionHours(tagged);
  const t = title.toLowerCase();
  if (t.includes("low impact")) return 0.5;
  if (t.includes("fast acting")) return 1;
  if (t.includes("med acting")) return 2;
  if (t.includes("slow acting")) return 3;
  if (t.includes("pizza")) return 2;
  if (/snack|fruit|yogurt|apple|cracker|bar\b/.test(t)) return 1;
  if (/pasta|burger|fried|burrito|lasagna|rice bowl/.test(t)) return 2.5;
  return 2;
}

/**
 * Clips [eatenAt, eatenAt + duration) to the viewed local day and timeline domain (same idea as sleep bands).
 */
function foodReferenceIntervalsForViewedDay(
  viewedYmd: string,
  eatenAtIso: string,
  durationHours: number,
  timeZone: string,
  xDomain: [number, number],
): Array<{ x1: number; x2: number }> {
  const dayStart = startOfLocalDayInZone(viewedYmd, timeZone);
  const dayEndExcl = endOfLocalDayExclusiveInZone(viewedYmd, timeZone);
  const s = new Date(eatenAtIso).getTime();
  const e = s + durationHours * 3_600_000;
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return [];

  const overlap0 = Math.max(s, dayStart.getTime());
  const overlap1 = Math.min(e, dayEndExcl.getTime());
  if (overlap0 >= overlap1) return [];

  const msPerHour = 3_600_000;
  const x1 = (overlap0 - dayStart.getTime()) / msPerHour;
  const x2 = (overlap1 - dayStart.getTime()) / msPerHour;

  const [dmin, dmax] = xDomain;
  const lo = Math.max(x1, dmin);
  const hi = Math.min(x2, dmax);
  if (lo >= hi - 1e-6) return [];
  return [{ x1: lo, x2: hi }];
}

function foodBandAndIconCenter(
  f: { eatenAt: string; title: string },
  viewedYmd: string,
  timeZone: string,
  xDomain: [number, number],
): { segs: Array<{ x1: number; x2: number }>; iconX: number | null } {
  const hrs = foodAbsorptionDurationHours(f.title);
  const segs = foodReferenceIntervalsForViewedDay(viewedYmd, f.eatenAt, hrs, timeZone, xDomain);
  const iconX =
    segs.length > 0 ? (segs[0]!.x1 + segs[0]!.x2) / 2 : null;
  return { segs, iconX };
}

function toLocalHourFraction(iso: string, timeZone: string) {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour + minute / 60;
}

/** Local midnight for `ymd` in `timeZone` as a UTC Date. */
function startOfLocalDayInZone(ymd: string, timeZone: string): Date {
  return toDate(`${ymd}T00:00:00`, { timeZone });
}

/** Start of the *next* local calendar day (exclusive end of `ymd`). */
function endOfLocalDayExclusiveInZone(ymd: string, timeZone: string): Date {
  const tomorrowYmd = formatInTimeZone(
    addDays(toDate(`${ymd}T12:00:00`, { timeZone }), 1),
    timeZone,
    "yyyy-MM-dd",
  );
  return toDate(`${tomorrowYmd}T00:00:00`, { timeZone });
}

/**
 * Hours since start of `viewedYmd` (local) for a sleep window, clipped to the chart X domain.
 * Fixes inverted bands when sleep crosses midnight (e.g. 10pm→7am must not use x1=22, x2=7).
 */
function sleepReferenceIntervalsForViewedDay(
  viewedYmd: string,
  sleepStartIso: string,
  sleepEndIso: string,
  timeZone: string,
  xDomain: [number, number],
): Array<{ x1: number; x2: number }> {
  const dayStart = startOfLocalDayInZone(viewedYmd, timeZone);
  const dayEndExcl = endOfLocalDayExclusiveInZone(viewedYmd, timeZone);
  const s = new Date(sleepStartIso).getTime();
  const e = new Date(sleepEndIso).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return [];

  const overlap0 = Math.max(s, dayStart.getTime());
  const overlap1 = Math.min(e, dayEndExcl.getTime());
  if (overlap0 >= overlap1) return [];

  const msPerHour = 3_600_000;
  const x1 = (overlap0 - dayStart.getTime()) / msPerHour;
  const x2 = (overlap1 - dayStart.getTime()) / msPerHour;

  const [dmin, dmax] = xDomain;
  const lo = Math.max(x1, dmin);
  const hi = Math.min(x2, dmax);
  if (lo >= hi - 1e-6) return [];
  return [{ x1: lo, x2: hi }];
}

/** Clip local clock-hour spans (activity bands) so ReferenceAreas cannot widen Recharts domain. */
function clipHourSegmentToTimeline(
  x1: number,
  x2: number,
  xDomain: [number, number],
): { x1: number; x2: number } | null {
  const [dmin, dmax] = xDomain;
  const lo = Math.max(x1, dmin);
  const hi = Math.min(x2, dmax);
  if (lo >= hi - 1e-6) return null;
  return { x1: lo, x2: hi };
}

/** End time for chart span; falls back to duration or a short default so the band is visible. */
function stravaActivityEndIso(a: {
  startAt: string;
  endAt: string | null;
  durationSec: number | null;
}): string {
  if (a.endAt) return a.endAt;
  const startMs = new Date(a.startAt).getTime();
  if (!Number.isFinite(startMs)) return a.startAt;
  if (a.durationSec != null && a.durationSec > 0) {
    return new Date(startMs + a.durationSec * 1000).toISOString();
  }
  return new Date(startMs + 30 * 60 * 1000).toISOString();
}

function activityBandXRange(
  startIso: string,
  endIso: string | null | undefined,
  timeZone: string,
): { x1: number; x2: number } {
  const x1 = toLocalHourFraction(startIso, timeZone);
  const resolvedEnd = endIso ?? startIso;
  let x2 = toLocalHourFraction(resolvedEnd, timeZone);
  if (x2 <= x1) x2 = Math.min(24, x1 + 5 / 60);
  return { x1, x2 };
}

function sleepBandIconX(seg: { x1: number; x2: number }): number {
  return (seg.x1 + seg.x2) / 2;
}

function manualWorkoutEmoji(workoutType?: string | null): string {
  const t = (workoutType ?? "").toLowerCase();
  if (t.includes("run")) return "🏃";
  if (t.includes("bike") || t.includes("ride") || t.includes("cycle")) return "🚴";
  if (t.includes("swim")) return "🏊";
  if (t.includes("walk") || t.includes("hike")) return "🚶";
  return "🏃";
}

function stravaActivityEmoji(sportType?: string | null, activityType?: string | null): string {
  const t = `${sportType ?? ""} ${activityType ?? ""}`.toLowerCase();
  if (t.includes("run")) return "🏃";
  if (t.includes("ride") || t.includes("bike") || t.includes("cycle")) return "🚴";
  if (t.includes("swim")) return "🏊";
  if (t.includes("walk") || t.includes("hike")) return "🚶";
  return "🏃";
}

/** Recharts cartesian label viewBox (ReferenceLine provides width on the vertical segment). */
type GlyphViewBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  upperWidth?: number;
  lowerWidth?: number;
};

function trapezoidFromViewBox(box: GlyphViewBox) {
  return {
    x: box.x,
    y: box.y,
    upperWidth: box.upperWidth ?? box.width,
    height: box.height,
  };
}

/** Match Recharts `position="top"` for cartesian labels (see getCartesianPosition). */
function labelXYTop(viewBox: GlyphViewBox | undefined, offset: number): { x: number; y: number } | null {
  if (!viewBox) return null;
  const { x, y, upperWidth, height } = trapezoidFromViewBox(viewBox);
  const verticalSign = height >= 0 ? 1 : -1;
  const verticalOffset = verticalSign * offset;
  return { x: x + upperWidth / 2, y: y - verticalOffset };
}

function TimelineGlyphLabel({
  viewBox,
  offset = 10,
  tooltip,
  fontSize,
  fill = "#333",
  children,
}: {
  viewBox?: GlyphViewBox;
  offset?: number;
  tooltip: string;
  fontSize: number;
  fill?: string;
  children: ReactNode;
}) {
  const pos = labelXYTop(viewBox, offset);
  if (!pos) return null;
  const hit = Math.max(28, fontSize * 1.35);
  return (
    <g className="pointer-events-auto" style={{ cursor: "default" }}>
      <title>{tooltip}</title>
      <rect
        x={pos.x - hit / 2}
        y={pos.y - hit * 0.72}
        width={hit}
        height={hit}
        fill="transparent"
      />
      <text
        x={pos.x}
        y={pos.y}
        fill={fill}
        fontSize={fontSize}
        textAnchor="middle"
        dominantBaseline="auto"
      >
        {children}
      </text>
    </g>
  );
}

function chartIconLabel(
  tooltip: string,
  emoji: string,
  options?: { fontSize?: number; fill?: string; offset?: number },
) {
  const fontSize = options?.fontSize ?? 24;
  const fill = options?.fill;
  const offset = options?.offset ?? 10;
  return {
    position: "top" as const,
    offset,
    // Recharts passes full Label props; we only need cartesian viewBox + offset.
    content: (props: { viewBox?: unknown; offset?: number }) => (
      <TimelineGlyphLabel
        viewBox={props.viewBox as GlyphViewBox | undefined}
        offset={props.offset ?? offset}
        tooltip={tooltip}
        fontSize={fontSize}
        fill={fill}
      >
        {emoji}
      </TimelineGlyphLabel>
    ),
  };
}

function formatShortClock(iso: string, timeZone: string): string {
  try {
    return formatInTimeZone(new Date(iso), timeZone, "h:mm a");
  } catch {
    return "";
  }
}

function formatElapsedSeconds(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function manualWorkoutTooltip(
  w: DayApiResponse["streams"]["manualWorkouts"][number],
  timeZone: string,
): string {
  const type = (w.workoutType?.trim() || "Workout").replace(/\s+/g, " ");
  const start = formatShortClock(w.startedAt, timeZone);
  if (!w.endedAt) {
    return `${type} · ${start} · in progress`;
  }
  const end = formatShortClock(w.endedAt, timeZone);
  const durSec = (new Date(w.endedAt).getTime() - new Date(w.startedAt).getTime()) / 1000;
  const dur =
    Number.isFinite(durSec) && durSec > 0 ? ` · ${formatElapsedSeconds(durSec)}` : "";
  return `${type} · ${start}–${end}${dur}`;
}

function stravaActivityTooltipDetail(
  a: NonNullable<DayApiResponse["streams"]["stravaActivities"]>[number],
  timeZone: string,
): string {
  const type =
    a.name?.trim() ||
    `${a.sportType ?? ""} ${a.activityType ?? ""}`.trim().replace(/\s+/g, " ") ||
    "Activity";
  const start = formatShortClock(a.startAt, timeZone);
  const endIso = stravaActivityEndIso(a);
  const end = formatShortClock(endIso, timeZone);
  let line = `${type} · ${start}–${end}`;
  if (a.durationSec != null && a.durationSec > 0) {
    line += ` · ${formatElapsedSeconds(a.durationSec)}`;
  }
  return line;
}

function sleepWindowTooltip(sleepStart: string, sleepEnd: string, timeZone: string): string {
  const s = formatShortClock(sleepStart, timeZone);
  const e = formatShortClock(sleepEnd, timeZone);
  const durSec =
    (new Date(sleepEnd).getTime() - new Date(sleepStart).getTime()) / 1000;
  const dur =
    Number.isFinite(durSec) && durSec > 60 ? ` · ${formatElapsedSeconds(durSec)}` : "";
  return `Sleep · ${s}–${e}${dur}`;
}

function foodEntryTooltip(
  f: DayApiResponse["streams"]["foodEntries"][number],
  timeZone: string,
): string {
  const title = (f.title.trim() || "Food").replace(/\s+/g, " ");
  const { label: mealHint } = inferMealPeriodFromLocalTime(f.eatenAt, timeZone);
  const when = formatShortClock(f.eatenAt, timeZone);
  const hrs = foodAbsorptionDurationHours(f.title, f.notes);
  const windowLabel = hrs === 1 ? "~1h" : `~${hrs}h`;
  return `${title} · ${mealHint} · ${when} · ${windowLabel} absorption window (modeled)`;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

function hourLabel(v: number) {
  const totalMinutes = Math.round(v * 60);
  const hour24 = ((Math.floor(totalMinutes / 60) % 24) + 24) % 24;
  const minutes = ((totalMinutes % 60) + 60) % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  if (minutes === 0) return `${hour12}${suffix}`;
  return `${hour12}:${String(minutes).padStart(2, "0")}${suffix}`;
}

function CombinedDayTooltip({ active, label, payload }: TooltipContentProps) {
  const row = payload?.[0]?.payload as ChartRow | undefined;
  if (!active || !row) return null;
  return (
    <div className="rounded-xl border border-align-border/90 bg-white/95 px-3 py-2 text-xs shadow-lg shadow-black/5 ring-1 ring-black/[0.04] backdrop-blur-sm">
      <p className="font-medium text-zinc-800">Time: {hourLabel(Number(label))}</p>
      {row.glucose != null ? (
        <p className="text-zinc-700">Glucose: {row.glucose} mg/dL</p>
      ) : (
        <p className="text-zinc-500">No glucose in this hour</p>
      )}
      <p className="text-zinc-600">Steps: {row.steps}</p>
    </div>
  );
}

type Props = {
  dateYmd: string;
};

export function DailyViewChart({ dateYmd }: Props) {
  const resolvedDateYmd = useResolvedDayYmd(dateYmd);
  const effectiveTz = useEffectiveTimeZone();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [payload, setPayload] = useState<DayApiResponse | null>(null);
  const [prefs, setPrefs] = useState<ChartDisplayPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timelineWindow, setTimelineWindow] = useState<TimelineWindow>("24h");
  const [nowTick, setNowTick] = useState(0);
  const [isVerySmallScreen, setIsVerySmallScreen] = useState(false);
  const [isMobileScreen, setIsMobileScreen] = useState(false);
  const [reloadBusy, setReloadBusy] = useState(false);

  type DayLoadMode = "navigation" | "same-day-refresh";

  const loadDayData = useCallback(async (mode: DayLoadMode = "navigation") => {
    setError(null);
    if (mode === "navigation") {
      setPayload(null);
    }
    try {
      const tz = effectiveTz;
      const resp = await fetch(
        `/api/day?date=${encodeURIComponent(resolvedDateYmd)}&timeZone=${encodeURIComponent(tz)}`,
        {
          cache: "no-store",
        },
      );
      const json = (await resp.json()) as DayApiResponse & { error?: string };
      if (!resp.ok) throw new Error(json.error ?? "Failed to load day data");
      setPayload(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [resolvedDateYmd, effectiveTz]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void loadDayData("navigation");
    });
    return () => cancelAnimationFrame(id);
  }, [loadDayData]);

  useEffect(() => {
    function onDayDataChanged() {
      void loadDayData("same-day-refresh");
    }
    window.addEventListener(DAY_DATA_CHANGED_EVENT, onDayDataChanged);
    return () => {
      window.removeEventListener(DAY_DATA_CHANGED_EVENT, onDayDataChanged);
    };
  }, [loadDayData]);

  useEffect(() => {
    if (!payload) return;
    const tz = payload.day.timeZone;
    const isTodayView = resolvedDateYmd === getLocalCalendarYmd(new Date(), tz);
    if (timelineWindow !== "12h" || !isTodayView) return;
    const id = setInterval(() => setNowTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [payload, resolvedDateYmd, timelineWindow]);

  useEffect(() => {
    const read = () => setIsVerySmallScreen(window.innerWidth < 380);
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  useEffect(() => {
    const read = () => setIsMobileScreen(window.innerWidth < 640);
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  /** 12h rolling window is only for the current local calendar day; other days stay 24h. */
  useEffect(() => {
    if (!payload) return;
    const tz = payload.day.timeZone;
    const isTodayView = resolvedDateYmd === getLocalCalendarYmd(new Date(), tz);
    if (!isTodayView && timelineWindow === "12h") {
      queueMicrotask(() => setTimelineWindow("24h"));
    }
  }, [payload, resolvedDateYmd, timelineWindow]);

  /**
   * If you're in 12h view (today-only) but log something outside the rolling window,
   * switch back to 24h so every day-overview entry is visible on the chart.
   */
  useEffect(() => {
    if (!payload) return;
    if (timelineWindow !== "12h") return;
    const tz = payload.day.timeZone;
    const isTodayView = resolvedDateYmd === getLocalCalendarYmd(new Date(), tz);
    if (!isTodayView) return;

    const domain12h = timelineDomain12h(resolvedDateYmd, tz, new Date());
    const [xMin, xMax] = domain12h;

    let minHour = Number.POSITIVE_INFINITY;
    let maxHour = Number.NEGATIVE_INFINITY;

    for (const w of payload.streams.manualWorkouts) {
      const { x1, x2 } = activityBandXRange(w.startedAt, w.endedAt, tz);
      minHour = Math.min(minHour, x1);
      maxHour = Math.max(maxHour, x2);
    }

    for (const a of payload.streams.stravaActivities ?? []) {
      const { x1, x2 } = activityBandXRange(a.startAt, stravaActivityEndIso(a), tz);
      minHour = Math.min(minHour, x1);
      maxHour = Math.max(maxHour, x2);
    }

    for (const f of payload.streams.foodEntries) {
      const x = toLocalHourFraction(f.eatenAt, tz);
      minHour = Math.min(minHour, x);
      maxHour = Math.max(maxHour, x);
    }

    for (const s of payload.streams.sleepWindows) {
      const x1 = toLocalHourFraction(s.sleepStart, tz);
      const x2 = toLocalHourFraction(s.sleepEnd, tz);
      minHour = Math.min(minHour, x1, x2);
      maxHour = Math.max(maxHour, x1, x2);
    }

    if (!Number.isFinite(minHour) || !Number.isFinite(maxHour)) return;
    const eps = 1e-6;
    if (minHour < xMin - eps || maxHour > xMax + eps) {
      queueMicrotask(() => setTimelineWindow("24h"));
    }
  }, [payload, resolvedDateYmd, timelineWindow]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const resp = await fetch("/api/settings/preferences", { cache: "no-store" });
        const json = (await resp.json()) as {
          preferences?: ChartDisplayPreferences & { patternThresholdPercent?: number };
          error?: string;
        };
        if (!resp.ok || !json.preferences) {
          throw new Error(json.error ?? "Failed to load display preferences");
        }
        if (!cancelled) setPrefs(json.preferences);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const chartData = useMemo(() => {
    if (!payload) {
      return [] as ChartRow[];
    }
    const tz = payload.day.timeZone;

    const stepsByHour = new Array<number>(24).fill(0);
    for (const s of payload.streams.hourlySteps) {
      const h = Math.floor(toLocalHourFraction(s.bucketStart, tz));
      if (h >= 0 && h < 24) stepsByHour[h] += s.stepCount;
    }

    const glucoseLastByHour: (number | null)[] = new Array(24).fill(null);
    const sortedGlucose = [...payload.streams.glucose].sort(
      (a, b) =>
        new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime(),
    );
    for (const g of sortedGlucose) {
      const h = Math.floor(toLocalHourFraction(g.observedAt, tz));
      if (h >= 0 && h < 24) glucoseLastByHour[h] = g.mgdl;
    }

    const maxSteps = Math.max(1, ...stepsByHour);
    const band = STEP_Y_MAX - STEP_Y_MIN;
    const minSpan = band * STEP_BAR_MIN_FRACTION;
    /** Double visual sensitivity vs max-day (clamp so bars never exceed the step band). */
    const STEP_HEIGHT_SCALE = 2;
    const rows: ChartRow[] = [];
    for (let h = 0; h < 24; h += 1) {
      const steps = stepsByHour[h];
      const heightRatio = Math.min(1, (steps / maxSteps) * STEP_HEIGHT_SCALE);
      const proportionalTop = STEP_Y_MIN + heightRatio * band;
      const stepsBarTop =
        steps > 0 ? Math.max(STEP_Y_MIN + minSpan, proportionalTop) : STEP_Y_MIN;
      rows.push({
        xHour: h,
        glucose: glucoseLastByHour[h],
        steps,
        stepsRange: [STEP_Y_MIN, stepsBarTop],
      });
    }
    return rows;
  }, [payload]);

  const chartSeriesAnimKey = useMemo(() => {
    if (!chartData.length) return resolvedDateYmd;
    let glucoseHours = 0;
    let stepSum = 0;
    for (const r of chartData) {
      if (r.glucose != null) glucoseHours += 1;
      stepSum += r.steps;
    }
    return `${resolvedDateYmd}|${glucoseHours}|${stepSum}`;
  }, [chartData, resolvedDateYmd]);

  const seriesAnimActive = !prefersReducedMotion;

  async function reloadLatestData() {
    if (reloadBusy) return;
    setReloadBusy(true);
    try {
      const results = await Promise.allSettled([
        fetch("/api/integrations/dexcom/sync?format=json", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
        fetch("/api/integrations/strava/sync?format=json", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
        fetch("/api/import/health-sync", {
          method: "POST",
          cache: "no-store",
          credentials: "include",
        }),
      ]);

      const anySucceeded = results.some(
        (r) => r.status === "fulfilled" && r.value.ok,
      );

      // Refresh day chart/cards even if only one integration succeeded.
      if (anySucceeded) {
        window.dispatchEvent(new CustomEvent(DAY_DATA_CHANGED_EVENT));
      }
    } finally {
      setReloadBusy(false);
    }
  }

  if (error) {
    return (
      <section className="w-full rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Daily chart error: {error}
      </section>
    );
  }

  if (!payload) {
    return <DailyViewChartSkeleton />;
  }

  const tz = payload.day.timeZone;
  const low = payload.aggregates.tir.targetLowMgdl;
  const high = payload.aggregates.tir.targetHighMgdl;
  const showSteps = prefs?.showSteps ?? true;
  const showActivity = prefs?.showActivity ?? true;
  const showSleep = prefs?.showSleep ?? true;
  const showFood = prefs?.showFood ?? true;

  void nowTick;
  const chartNow = new Date();
  const isTodayView = resolvedDateYmd === getLocalCalendarYmd(new Date(), tz);
  const effectiveTimelineWindow: TimelineWindow =
    isTodayView && timelineWindow === "12h" ? "12h" : "24h";
  const xDomain = timelineDomain(effectiveTimelineWindow, resolvedDateYmd, tz, chartNow);
  const [xMin, xMax] = xDomain;
  const xTicks = timelineTicks(effectiveTimelineWindow, xDomain);

  const chartMargins = {
    top: 36,
    right: isMobileScreen ? 8 : 12,
    bottom: 8,
    left: isMobileScreen ? 0 : isVerySmallScreen ? 0 : 2,
  };

  return (
    <section className="w-full min-w-0 rounded-2xl border border-align-border/90 bg-white/90 p-5 text-left ring-1 ring-black/[0.03] backdrop-blur-[2px] md:p-6">
      <div className="flex flex-row items-center justify-between gap-3">
        <h2 className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-[0.12em] text-align-muted">
          Daily View
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={reloadBusy}
            onClick={() => void reloadLatestData()}
            className="inline-flex min-h-9 items-center justify-center rounded-full border border-align-border/90 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-700 ring-1 ring-black/[0.03] transition hover:bg-align-subtle disabled:cursor-not-allowed disabled:opacity-60"
          >
            {reloadBusy ? "Reloading…" : "Reload data"}
          </button>
          {(
            [
              { id: "24h" as const, label: "24h" },
              { id: "12h" as const, label: "12h" },
            ] as const
          ).map(({ id, label }) => {
            const is12 = id === "12h";
            const disabled = is12 && !isTodayView;
            const selected = effectiveTimelineWindow === id;
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                title={disabled ? "12h view is only available when viewing today" : undefined}
                onClick={() => {
                  if (!disabled) setTimelineWindow(id);
                }}
                className={
                  selected
                    ? "inline-flex min-h-9 min-w-[2.9rem] items-center justify-center rounded-full bg-align-forest px-2.5 py-1 text-center text-[11px] font-medium leading-none text-white shadow-sm shadow-black/10"
                    : disabled
                      ? "inline-flex min-h-9 min-w-[2.9rem] items-center justify-center cursor-not-allowed rounded-full bg-zinc-100 px-2.5 py-1 text-center text-[11px] font-medium leading-none text-zinc-400 ring-1 ring-black/[0.04]"
                      : "inline-flex min-h-9 min-w-[2.9rem] items-center justify-center rounded-full bg-align-subtle px-2.5 py-1 text-center text-[11px] font-medium leading-none text-zinc-600 ring-1 ring-black/[0.04] hover:bg-white"
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div
        key={resolvedDateYmd}
        className="mt-4 h-[22rem] min-h-[20rem] w-full min-w-0 rounded-xl bg-gradient-to-b from-align-subtle/90 to-align-canvas/40 p-1.5 ring-1 ring-inset ring-black/[0.03] motion-safe:animate-[alignChartEnter_0.38s_ease-out_both] motion-reduce:animate-none sm:h-96 sm:p-2"
      >
        <div className="flex h-full min-h-0 w-full">
          {isMobileScreen ? (
            <div
              className={`flex h-full shrink-0 flex-col border-r border-black/[0.06] bg-gradient-to-b from-align-subtle/90 to-align-canvas/40 ${
                isVerySmallScreen ? "w-14" : "w-12"
              }`}
              aria-hidden
            >
              <div className="relative h-full w-full pt-9 pb-3">
                {BG_AXIS_TICKS.map((tick) => {
                  const topPct = ((300 - tick) / (300 - STEP_Y_MIN)) * 100;
                  return (
                    <span
                      key={tick}
                      className="absolute right-1 -translate-y-1/2 text-[10px] font-semibold tabular-nums text-zinc-600"
                      style={{ top: `${topPct}%` }}
                    >
                      {tick}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
            <div className={isMobileScreen ? "h-full min-w-[38rem]" : "h-full w-full"}>
              <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={260}>
                <ComposedChart data={chartData} margin={chartMargins}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4ebea" />
            {showSteps ? (
              <ReferenceArea
                x1={xMin}
                x2={xMax}
                y1={STEP_Y_MIN}
                y2={GLUCOSE_FLOOR}
                fill="#ebeff2"
                fillOpacity={0.85}
                ifOverflow="extendDomain"
              />
            ) : null}
            {showSleep && payload.streams.sleepWindows.length > 0
              ? payload.streams.sleepWindows.flatMap((s) => {
                  const segs = sleepReferenceIntervalsForViewedDay(
                    resolvedDateYmd,
                    s.sleepStart,
                    s.sleepEnd,
                    tz,
                    xDomain,
                  );
                  const areas = segs.map((seg, i) => (
                    <ReferenceArea
                      key={`sleep-${s.id}-${i}`}
                      x1={seg.x1}
                      x2={seg.x2}
                      y1={GLUCOSE_FLOOR}
                      y2={300}
                      fill={SLEEP_BAND_FILL}
                      fillOpacity={SLEEP_BAND_FILL_OPACITY}
                      ifOverflow="extendDomain"
                    />
                  ));
                  const icons = segs.map((seg, i) => (
                    <ReferenceLine
                      key={`sleep-icon-${s.id}-${i}`}
                      x={sleepBandIconX(seg)}
                      stroke="transparent"
                      strokeWidth={0}
                      zIndex={35}
                      label={chartIconLabel(sleepWindowTooltip(s.sleepStart, s.sleepEnd, tz), "😴")}
                    />
                  ));
                  return [...areas, ...icons];
                })
              : null}
            {showActivity
              ? payload.streams.manualWorkouts.flatMap((w) => {
                  const raw = activityBandXRange(w.startedAt, w.endedAt, tz);
                  const clipped = clipHourSegmentToTimeline(raw.x1, raw.x2, xDomain);
                  if (!clipped) return [];
                  const { x1, x2 } = clipped;
                  const iconX = (x1 + x2) / 2;
                  return [
                      <ReferenceArea
                        key={`workout-${w.id}`}
                        x1={x1}
                        x2={x2}
                        y1={GLUCOSE_FLOOR}
                        y2={300}
                        fill="#f9a8a4"
                        fillOpacity={0.16}
                        ifOverflow="hidden"
                      />,
                      <ReferenceLine
                        key={`workout-icon-${w.id}`}
                        x={iconX}
                        stroke="transparent"
                        strokeWidth={0}
                        zIndex={35}
                        label={chartIconLabel(
                          manualWorkoutTooltip(w, tz),
                          manualWorkoutEmoji(w.workoutType),
                        )}
                      />
                    ];
                })
              : null}
            {showActivity
              ? (payload.streams.stravaActivities ?? []).flatMap((a) => {
                  const raw = activityBandXRange(a.startAt, stravaActivityEndIso(a), tz);
                  const clipped = clipHourSegmentToTimeline(raw.x1, raw.x2, xDomain);
                  if (!clipped) return [];
                  const { x1, x2 } = clipped;
                  const iconX = (x1 + x2) / 2;
                  return [
                      <ReferenceArea
                        key={`strava-${a.id}`}
                        x1={x1}
                        x2={x2}
                        y1={GLUCOSE_FLOOR}
                        y2={300}
                        fill="#f9a8a4"
                        fillOpacity={0.16}
                        ifOverflow="hidden"
                      />,
                      <ReferenceLine
                        key={`strava-icon-${a.id}`}
                        x={iconX}
                        stroke="transparent"
                        strokeWidth={0}
                        zIndex={35}
                        label={chartIconLabel(
                          stravaActivityTooltipDetail(a, tz),
                          stravaActivityEmoji(a.sportType, a.activityType),
                        )}
                      />
                    ];
                })
              : null}
            {showFood
              ? payload.streams.foodEntries.flatMap((f) => {
                  const { segs, iconX } = foodBandAndIconCenter(
                    f,
                    resolvedDateYmd,
                    tz,
                    xDomain,
                  );
                  const areas = segs.map((seg, i) => (
                    <ReferenceArea
                      key={`food-band-${f.id}-${i}`}
                      x1={seg.x1}
                      x2={seg.x2}
                      y1={GLUCOSE_FLOOR}
                      y2={300}
                      fill={FOOD_BAND_FILL}
                      fillOpacity={FOOD_BAND_FILL_OPACITY}
                      ifOverflow="extendDomain"
                    />
                  ));
                  const icon =
                    iconX != null ? (
                      <ReferenceLine
                        key={`food-icon-${f.id}`}
                        x={iconX}
                        stroke="transparent"
                        strokeWidth={0}
                        zIndex={40}
                        label={chartIconLabel(foodEntryTooltip(f, tz), "🍽", {
                          fill: "#166534",
                        })}
                      />
                    ) : null;
                  return [...areas, icon].filter((n) => n != null);
                })
              : null}

            <ReferenceLine y={low} stroke="#c9a227" strokeDasharray="6 4" strokeOpacity={0.85} />
            <ReferenceLine y={high} stroke="#c9a227" strokeDasharray="6 4" strokeOpacity={0.85} />

            <XAxis
              type="number"
              dataKey="xHour"
              domain={[xMin, xMax]}
              ticks={xTicks}
              tickFormatter={hourLabel}
              tick={{ fontSize: 11 }}
              allowDataOverflow
              {...(effectiveTimelineWindow === "12h"
                ? { niceTicks: "none" as const, padding: { left: 0, right: 0 } }
                : {})}
            />
                {!isMobileScreen ? (
                  <YAxis
                    type="number"
                    domain={[STEP_Y_MIN, 300]}
                    ticks={[...BG_AXIS_TICKS]}
                    tick={{
                      fontSize: isVerySmallScreen ? 10 : 11,
                      fill: "#4b5563",
                      fontWeight: 500,
                    }}
                    tickFormatter={(v) => String(v)}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    allowDecimals={false}
                    width={40}
                  />
                ) : null}

                <Tooltip content={CombinedDayTooltip} />

                {showSteps ? (
                  <Bar
                    key={`steps-${chartSeriesAnimKey}`}
                    dataKey="stepsRange"
                    fill="#94a3b8"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={36}
                    isAnimationActive={seriesAnimActive}
                    animationDuration={520}
                    animationEasing="ease-out"
                  />
                ) : null}
                <Line
                  key={`glucose-${chartSeriesAnimKey}`}
                  type="monotone"
                  dataKey="glucose"
                  connectNulls
                  stroke="#1b4d43"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={seriesAnimActive}
                  animationDuration={840}
                  animationEasing="ease-out"
                  animationBegin={seriesAnimActive ? 90 : 0}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          </div>
        </div>
      </div>
    </section>
  );
}
