"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DAY_DATA_CHANGED_EVENT } from "@/lib/day-view-events";
import { useResolvedDayYmd } from "@/lib/use-resolved-day-ymd";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
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

/** One row per clock hour (local); glucose = last reading in that hour; steps drawn in lower Y band. */
type ChartRow = {
  xHour: number;
  glucose: number | null;
  steps: number;
  /** Y-axis span for the step bar: floor → top (Recharts bar interval). */
  stepsRange: readonly [number, number];
};

/** Glucose uses ≥ this Y value; step bars fill the band below it on the same scale. */
const GLUCOSE_FLOOR = 40;
const STEP_Y_MIN = 5;
const STEP_Y_MAX = GLUCOSE_FLOOR;

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

function hourLabel(v: number) {
  const hour = Math.floor(v);
  const suffix = hour >= 12 ? "PM" : "AM";
  const normalized = hour % 12 === 0 ? 12 : hour % 12;
  return `${normalized}${suffix}`;
}

function CombinedDayTooltip({ active, label, payload }: TooltipContentProps) {
  const row = payload?.[0]?.payload as ChartRow | undefined;
  if (!active || !row) return null;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm">
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
    const rows: ChartRow[] = [];
    for (let h = 0; h < 24; h += 1) {
      const steps = stepsByHour[h];
      const stepsBarTop = STEP_Y_MIN + (steps / maxSteps) * band;
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
    return (
      <section className="w-full rounded-lg border p-4 text-sm text-zinc-600">
        Loading daily chart…
      </section>
    );
  }

  const tz = payload.day.timeZone;
  const low = payload.aggregates.tir.targetLowMgdl;
  const high = payload.aggregates.tir.targetHighMgdl;
  const showSteps = prefs?.showSteps ?? true;
  const showActivity = prefs?.showActivity ?? true;
  const showSleep = prefs?.showSleep ?? true;
  const showFood = prefs?.showFood ?? true;

  return (
    <section className="w-full min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 text-left shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Daily View</h2>
        <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] text-zinc-600">
          24h timeline
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-500">Local timezone: {tz}</p>
      <div className="mt-3 h-72 w-full min-w-0 rounded-xl bg-zinc-50 p-2">
        <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={220}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 12, bottom: 8, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
            {showSteps ? (
              <ReferenceArea
                x1={0}
                x2={24}
                y1={STEP_Y_MIN}
                y2={GLUCOSE_FLOOR}
                fill="#f4f4f5"
                fillOpacity={0.85}
                ifOverflow="extendDomain"
              />
            ) : null}
            {showSleep
              ? payload.streams.sleepWindows.map((s) => (
                  <ReferenceArea
                    key={`sleep-${s.id}`}
                    x1={toLocalHourFraction(s.sleepStart, tz)}
                    x2={toLocalHourFraction(s.sleepEnd, tz)}
                    y1={GLUCOSE_FLOOR}
                    y2={300}
                    fill="#a78bfa"
                    fillOpacity={0.12}
                    ifOverflow="extendDomain"
                  />
                ))
              : null}
            {showActivity
              ? payload.streams.manualWorkouts.map((w) => (
                  <ReferenceArea
                    key={`workout-${w.id}`}
                    x1={toLocalHourFraction(w.startedAt, tz)}
                    x2={toLocalHourFraction(w.endedAt ?? w.startedAt, tz)}
                    y1={GLUCOSE_FLOOR}
                    y2={300}
                    fill="#fca5a5"
                    fillOpacity={0.2}
                    ifOverflow="extendDomain"
                  />
                ))
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
                      fontSize: 14,
                    }}
                  />
                ))
              : null}

            <ReferenceLine y={low} stroke="#f59e0b" strokeDasharray="6 4" />
            <ReferenceLine y={high} stroke="#f59e0b" strokeDasharray="6 4" />

            <XAxis
              type="number"
              dataKey="xHour"
              domain={[0, 24]}
              tickCount={13}
              tickFormatter={hourLabel}
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
                fill="#d4d4d8"
                radius={[3, 3, 0, 0]}
                maxBarSize={26}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="steps"
                  position="top"
                  fill="#71717a"
                  fontSize={10}
                  formatter={(v) => {
                    const n = typeof v === "number" ? v : Number(v);
                    return Number.isFinite(n) && n > 0 ? String(n) : "";
                  }}
                />
              </Bar>
            ) : null}
            <Line
              type="monotone"
              dataKey="glucose"
              connectNulls
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Visibility from Settings: steps {showSteps ? "on" : "off"}, activity{" "}
        {showActivity ? "on" : "off"}, sleep {showSleep ? "on" : "off"}, food{" "}
        {showFood ? "on" : "off"}.
      </p>
    </section>
  );
}
