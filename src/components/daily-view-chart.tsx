"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays } from "date-fns";
import { formatInTimeZone, toDate } from "date-fns-tz";

import { DailyViewChartSkeleton } from "@/components/skeleton";
import { DAY_DATA_CHANGED_EVENT } from "@/lib/day-view-events";
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
    manualWorkouts: Array<{ id: string; startedAt: string; endedAt: string | null }>;
    /** Strava-synced sessions for the day (same layer as manual workouts). */
    stravaActivities?: Array<{
      id: string;
      startAt: string;
      endAt: string | null;
      durationSec: number | null;
    }>;
    sleepWindows: Array<{ id: string; sleepStart: string; sleepEnd: string }>;
    foodEntries: Array<{ id: string; eatenAt: string; title: string }>;
  };
};

type ChartDisplayPreferences = {
  showSteps: boolean;
  showActivity: boolean;
  showSleep: boolean;
  showFood: boolean;
};

/** Full calendar day vs last 12 hours (ending at “now” for today; last 12h of day for past dates). */
type TimelineWindow = "24h" | "12h";

function timelineDomain24h(): [number, number] {
  return [0, 24];
}

function timelineDomain12h(viewedYmd: string, timeZone: string, now: Date): [number, number] {
  const todayYmd = getLocalCalendarYmd(now, timeZone);
  if (viewedYmd === todayYmd) {
    let end = Math.min(24, toLocalHourFraction(now.toISOString(), timeZone));
    if (end < 1 / 120) {
      end = 1 / 120;
    }
    const start = Math.max(0, end - 12);
    return [start, end];
  }
  return [12, 24];
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

function timelineSubtitle(
  window: TimelineWindow,
  viewedYmd: string,
  timeZone: string,
  now: Date,
): string {
  if (window === "24h") {
    return "Full calendar day (local)";
  }
  if (viewedYmd === getLocalCalendarYmd(now, timeZone)) {
    return "Last 12 hours through current time";
  }
  return "Noon–midnight (last 12 hours of this day)";
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

/** Sleep window shading — `align-card-steps` blue; only overlaps real sleep vs viewed day (handles midnight crossing). */
const SLEEP_BAND_FILL = "#d4e3f6";
const SLEEP_BAND_FILL_OPACITY = 0.38;

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

function hourLabel(v: number) {
  const totalMinutes = Math.round(v * 60);
  const hour24 = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
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
  const [payload, setPayload] = useState<DayApiResponse | null>(null);
  const [prefs, setPrefs] = useState<ChartDisplayPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timelineWindow, setTimelineWindow] = useState<TimelineWindow>("24h");
  const [nowTick, setNowTick] = useState(0);

  const loadDayData = useCallback(async () => {
    setError(null);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
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
  }, [resolvedDateYmd]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void loadDayData();
    });
    return () => cancelAnimationFrame(id);
  }, [loadDayData]);

  useEffect(() => {
    function onDayDataChanged() {
      void loadDayData();
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
  const xDomain = timelineDomain(timelineWindow, resolvedDateYmd, tz, chartNow);
  const [xMin, xMax] = xDomain;
  const xTicks = timelineTicks(timelineWindow, xDomain);
  const timelineHelp = timelineSubtitle(timelineWindow, resolvedDateYmd, tz, chartNow);

  return (
    <section className="w-full min-w-0 rounded-2xl border border-align-border/90 bg-white/90 p-5 text-left ring-1 ring-black/[0.03] backdrop-blur-[2px] md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold tracking-tight text-foreground md:text-lg">Daily View</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-align-muted">
            Timeline
          </span>
          {(
            [
              { id: "24h" as const, label: "24h" },
              { id: "12h" as const, label: "12h" },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTimelineWindow(id)}
              className={
                timelineWindow === id
                  ? "rounded-full bg-align-forest px-3 py-1.5 text-[11px] font-medium text-white shadow-sm shadow-black/10"
                  : "rounded-full bg-align-subtle px-3 py-1.5 text-[11px] font-medium text-zinc-600 ring-1 ring-black/[0.04] hover:bg-white"
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1.5 text-xs text-align-muted">
        {tz} · {timelineHelp}
      </p>
      <div className="mt-4 h-72 w-full min-w-0 rounded-xl bg-gradient-to-b from-align-subtle/90 to-align-canvas/40 p-2 ring-1 ring-inset ring-black/[0.03]">
        <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={220}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 12, bottom: 8, left: 4 }}>
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
              ? payload.streams.sleepWindows.flatMap((s) =>
                  sleepReferenceIntervalsForViewedDay(
                    resolvedDateYmd,
                    s.sleepStart,
                    s.sleepEnd,
                    tz,
                    xDomain,
                  ).map((seg, i) => (
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
                  )),
                )
              : null}
            {showActivity
              ? payload.streams.manualWorkouts.map((w) => {
                  const { x1, x2 } = activityBandXRange(w.startedAt, w.endedAt, tz);
                  return (
                    <ReferenceArea
                      key={`workout-${w.id}`}
                      x1={x1}
                      x2={x2}
                      y1={GLUCOSE_FLOOR}
                      y2={300}
                      fill="#f9a8a4"
                      fillOpacity={0.16}
                      ifOverflow="extendDomain"
                    />
                  );
                })
              : null}
            {showActivity
              ? (payload.streams.stravaActivities ?? []).map((a) => {
                  const { x1, x2 } = activityBandXRange(a.startAt, stravaActivityEndIso(a), tz);
                  return (
                    <ReferenceArea
                      key={`strava-${a.id}`}
                      x1={x1}
                      x2={x2}
                      y1={GLUCOSE_FLOOR}
                      y2={300}
                      fill="#f9a8a4"
                      fillOpacity={0.16}
                      ifOverflow="extendDomain"
                    />
                  );
                })
              : null}
            {showFood
              ? payload.streams.foodEntries.map((f) => (
                  <ReferenceLine
                    key={`food-${f.id}`}
                    x={toLocalHourFraction(f.eatenAt, tz)}
                    stroke="#fb923c"
                    strokeDasharray="3 6"
                    label={{
                      value: "🍴",
                      position: "top",
                      fill: "#ea580c",
                      fontSize: 19,
                    }}
                  />
                ))
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
            />
            <YAxis
              type="number"
              domain={[STEP_Y_MIN, 300]}
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => (v < GLUCOSE_FLOOR ? "" : String(v))}
              allowDecimals={false}
            />

            <Tooltip content={CombinedDayTooltip} />

            {showSteps ? (
              <Bar
                dataKey="stepsRange"
                fill="#94a3b8"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
                isAnimationActive={false}
              />
            ) : null}
            <Line
              type="monotone"
              dataKey="glucose"
              connectNulls
              stroke="#1b4d43"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
