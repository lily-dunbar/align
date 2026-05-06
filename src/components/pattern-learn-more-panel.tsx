"use client";

import { useId, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { PatternEvidenceChart, PatternLearnMore } from "@/lib/patterns/types";

function tooltipNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return undefined;
}

function hourTick(h: number) {
  if (h === 0) return "12a";
  if (h < 12) return `${h}a`;
  if (h === 12) return "12p";
  return `${h - 12}p`;
}

function shortYmd(ymd: string | undefined): string {
  if (ymd && ymd.length >= 10) return ymd.slice(5);
  return ymd ?? "";
}

function EvidenceChartInner({ chart, targetLow, targetHigh }: { chart: PatternEvidenceChart; targetLow: number; targetHigh: number }) {
  if (chart.kind === "empty") {
    return (
      <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/80 px-3 py-6 text-center text-sm text-zinc-500">
        Not enough structured points for a chart on this pattern.
      </p>
    );
  }

  if (chart.kind === "hour_of_day") {
    const overlays = chart.overlayDays ?? [];
    const lineData = chart.points.map((p) => {
      const row: Record<string, number | null> = {
        hour: p.hour,
        meanMgdl: p.meanMgdl,
      };
      overlays.forEach((day, i) => {
        row[`overlay_${i}`] = day.hourMeanMgdl[p.hour] ?? null;
      });
      return row;
    });
    return (
      <div className="space-y-2">
        {overlays.length > 0 ? (
          <p className="text-[11px] leading-snug text-zinc-600">
            Faint lines: one calendar day each ({overlays.length} days). Thick line: average across your selected range.
          </p>
        ) : null}
        <div className="h-[220px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200" />
              <XAxis dataKey="hour" type="number" domain={[0, 23]} ticks={[0, 4, 8, 12, 16, 20]} tickFormatter={hourTick} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} width={36} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const hourVal = typeof label === "number" ? label : Number(label);
                  const row = payload[0]?.payload as Record<string, unknown> | undefined;
                  const meanRaw = row?.meanMgdl;
                  const meanMgdl = typeof meanRaw === "number" ? meanRaw : null;
                  const atHour = Number.isFinite(hourVal) ? hourVal : Number(row?.hour);
                  return (
                    <div className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-md">
                      <p className="font-medium text-zinc-800">{Number.isFinite(atHour) ? `Hour ${hourTick(atHour)}` : ""}</p>
                      <p className="text-zinc-700">
                        Average: <span className="font-medium">{meanMgdl != null ? `${Math.round(meanMgdl)} mg/dL` : "—"}</span>
                      </p>
                      {overlays.length > 0 ? (
                        <p className="mt-0.5 text-zinc-500">Individual-day traces shown as faint lines (not listed here).</p>
                      ) : null}
                    </div>
                  );
                }}
              />
              {chart.shadeRanges?.map(([a, b], i) => (
                <ReferenceArea
                  key={i}
                  x1={a - 0.5}
                  x2={b + 0.5}
                  fill="#8b5cf6"
                  fillOpacity={0.08}
                />
              ))}
              <ReferenceLine y={targetLow} stroke="#94a3b8" strokeDasharray="4 4" />
              <ReferenceLine y={targetHigh} stroke="#94a3b8" strokeDasharray="4 4" />
              {overlays.map((day, i) => (
                <Line
                  key={`${day.ymd}-${i}`}
                  type="monotone"
                  dataKey={`overlay_${i}`}
                  stroke="#a1a1aa"
                  strokeOpacity={0.35}
                  strokeWidth={1}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
              <Line type="monotone" dataKey="meanMgdl" stroke="#6d28d9" strokeWidth={2.5} dot={false} connectNulls name="Average" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  if (chart.kind === "dual_hour_profile") {
    return (
      <div className="space-y-2">
        {chart.caption ? (
          <p className="text-[11px] leading-snug text-zinc-600">{chart.caption}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#4f46e5]" aria-hidden />
            Weekday
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#0d9488]" aria-hidden />
            Weekend
          </span>
        </div>
        <div className="h-[220px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart.points} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200" />
              <XAxis
                dataKey="hour"
                type="number"
                domain={[0, 23]}
                ticks={[0, 4, 8, 12, 16, 20]}
                tickFormatter={hourTick}
                tick={{ fontSize: 10 }}
              />
              <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} width={36} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const hourVal = typeof label === "number" ? label : Number(label);
                  const row = payload[0]?.payload as
                    | {
                        weekdayMeanMgdl?: number | null;
                        weekendMeanMgdl?: number | null;
                      }
                    | undefined;
                  return (
                    <div className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-md">
                      <p className="font-medium text-zinc-800">
                        {Number.isFinite(hourVal) ? `Hour ${hourTick(hourVal)}` : ""}
                      </p>
                      <p className="text-zinc-700">
                        Weekday:{" "}
                        <span className="font-medium">
                          {row?.weekdayMeanMgdl != null
                            ? `${Math.round(row.weekdayMeanMgdl)} mg/dL`
                            : "—"}
                        </span>
                      </p>
                      <p className="text-zinc-700">
                        Weekend:{" "}
                        <span className="font-medium">
                          {row?.weekendMeanMgdl != null
                            ? `${Math.round(row.weekendMeanMgdl)} mg/dL`
                            : "—"}
                        </span>
                      </p>
                    </div>
                  );
                }}
              />
              <ReferenceLine y={targetLow} stroke="#94a3b8" strokeDasharray="4 4" />
              <ReferenceLine y={targetHigh} stroke="#94a3b8" strokeDasharray="4 4" />
              <Legend wrapperStyle={{ display: "none" }} />
              <Line
                type="monotone"
                dataKey="weekdayMeanMgdl"
                stroke="#4f46e5"
                strokeWidth={2.5}
                dot={false}
                connectNulls
                name="Weekday"
              />
              <Line
                type="monotone"
                dataKey="weekendMeanMgdl"
                stroke="#0d9488"
                strokeWidth={2.5}
                dot={false}
                connectNulls
                name="Weekend"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  if (chart.kind === "scatter_steps_mgdl") {
    const th = chart.thresholdSteps;
    const active = chart.points.filter((p) => p.steps >= th);
    const quiet = chart.points.filter((p) => p.steps < th);
    return (
      <div className="space-y-2">
        <p className="text-[11px] leading-snug text-zinc-600">
          Teal: days at or above {th.toLocaleString()} steps. Blue: below. Compare cloud shape to the dashed threshold, not hour-by-hour movement.
        </p>
        <div className="h-[240px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200" />
              <XAxis type="number" dataKey="steps" name="Steps" tick={{ fontSize: 10 }} />
              <YAxis type="number" dataKey="meanMgdl" name="mg/dL" tick={{ fontSize: 10 }} width={36} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as
                    | { ymd?: string; steps?: number; meanMgdl?: number }
                    | undefined;
                  if (!row) return null;
                  return (
                    <div className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-md">
                      <p className="font-medium text-zinc-800">{row.ymd ?? ""}</p>
                      <p className="text-zinc-700">
                        Steps:{" "}
                        <span className="font-medium">
                          {row.steps != null ? row.steps.toLocaleString() : "—"}
                        </span>
                      </p>
                      <p className="text-zinc-700">
                        Avg glucose:{" "}
                        <span className="font-medium">
                          {row.meanMgdl != null ? `${Math.round(row.meanMgdl)} mg/dL` : "—"}
                        </span>
                      </p>
                    </div>
                  );
                }}
              />
              <ReferenceLine
                x={chart.thresholdSteps}
                stroke="#64748b"
                strokeDasharray="5 5"
                label={{ value: `${chart.thresholdSteps.toLocaleString()} steps`, position: "top", fontSize: 10 }}
              />
              <Scatter name="At/above threshold" data={active} fill="#0d9488" fillOpacity={0.9} />
              <Scatter name="Below threshold" data={quiet} fill="#2563eb" fillOpacity={0.85} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  if (chart.kind === "bars_session_delta") {
    const data = chart.items.map((it) => ({
      name: `${shortYmd(it.startYmd)} ${it.label}`.replace(/^\s+/, "").slice(0, 42),
      delta: it.deltaMgdl,
      fill: it.deltaMgdl >= 0 ? "#c2410c" : "#1d4ed8",
    }));
    return (
      <div className="space-y-2">
        <p className="text-[11px] leading-snug text-zinc-600">
          Each bar is one workout: glucose during the session minus roughly the 90 minutes before start. Negative usually means glucose fell during the effort.
        </p>
        <div className="h-[220px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
              <YAxis type="category" dataKey="name" width={132} tick={{ fontSize: 9 }} />
            <Tooltip
              formatter={(v) => {
                const n = tooltipNumber(v);
                const t = n != null ? `${n > 0 ? "+" : ""}${Math.round(n)} mg/dL` : "—";
                return [t, "Δ during vs before"];
              }}
            />
            <ReferenceLine x={0} stroke="#71717a" />
            <Bar dataKey="delta" radius={[0, 4, 4, 0]}>
              {data.map((e, i) => (
                <Cell key={i} fill={e.fill} />
              ))}
            </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  if (chart.kind === "two_bar") {
    const data = [
      { name: chart.left.label.slice(0, 32), mgdl: chart.left.valueMgdl, fill: "#4f46e5" },
      { name: chart.right.label.slice(0, 32), mgdl: chart.right.valueMgdl, fill: "#0d9488" },
    ];
    return (
      <div className="space-y-2">
        {chart.caption ? (
          <p className="text-[11px] leading-snug text-zinc-600">{chart.caption}</p>
        ) : null}
        <div className="h-[200px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: chart.caption ? 36 : 32 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-12} textAnchor="end" height={52} />
              <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} width={36} />
              <Tooltip
                formatter={(v) => {
                  const n = tooltipNumber(v);
                  return [n != null ? `${Math.round(n)} mg/dL` : "—", "Average glucose"];
                }}
              />
              <ReferenceLine y={targetLow} stroke="#94a3b8" strokeDasharray="4 4" />
              <ReferenceLine y={targetHigh} stroke="#94a3b8" strokeDasharray="4 4" />
              <Bar dataKey="mgdl" radius={[6, 6, 0, 0]}>
                {data.map((e, i) => (
                  <Cell key={i} fill={e.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  return null;
}

function SectionBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-200/90 bg-zinc-50/70 px-3 py-3 sm:px-4">
      <div className="flex gap-2.5">
        <span className="mt-1.5 h-8 w-0.5 shrink-0 rounded-full bg-zinc-300" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            {label}
          </p>
          {children}
        </div>
      </div>
    </div>
  );
}

type Props = {
  learnMore: PatternLearnMore;
  targetLowMgdl: number;
  targetHighMgdl: number;
};

export function PatternLearnMorePanel({ learnMore, targetLowMgdl, targetHighMgdl }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="mt-5 border-t border-align-border-soft pt-4">
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Collapse methodology details" : "Learn more — how we calculated this pattern"}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-center justify-between gap-2 rounded-md px-0 py-0.5 text-left text-sm font-semibold text-align-forest transition hover:text-align-forest-muted"
      >
        <span>Learn more</span>
        <span
          className="text-2xl leading-none text-align-muted transition group-hover:text-align-forest sm:text-[1.75rem]"
          aria-hidden
        >
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <div id={panelId} className="mt-3 space-y-3 text-sm">
          <SectionBlock label="Chart">
            <div className="rounded-lg border border-zinc-200/90 bg-white p-2 shadow-sm">
              <EvidenceChartInner
                chart={learnMore.chart}
                targetLow={targetLowMgdl}
                targetHigh={targetHighMgdl}
              />
            </div>
          </SectionBlock>

          <SectionBlock label="How to read this insight">
            <p className="text-sm leading-relaxed text-zinc-700">{learnMore.explanation}</p>
          </SectionBlock>

          <SectionBlock label="Sample dates used">
            <p className="text-xs leading-relaxed text-zinc-600">{learnMore.contributingNote}</p>
            {learnMore.contributingDaysYmd.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5 pt-0.5">
                {learnMore.contributingDaysYmd.map((ymd) => (
                  <li key={ymd}>
                    <span className="inline-block rounded-md border border-zinc-200/90 bg-white px-2 py-0.5 font-mono text-[11px] text-zinc-800 shadow-sm">
                      {ymd}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-zinc-500">No sample dates listed.</p>
            )}
          </SectionBlock>

          <p className="rounded-lg bg-zinc-100/80 px-3 py-2 text-[11px] leading-relaxed text-zinc-600">
            This is descriptive only—not medical advice. Discuss changes with your care team.
          </p>
        </div>
      ) : null}
    </div>
  );
}
