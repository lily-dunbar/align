"use client";

import { useId, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

function EvidenceChartInner({ chart, targetLow, targetHigh }: { chart: PatternEvidenceChart; targetLow: number; targetHigh: number }) {
  if (chart.kind === "empty") {
    return (
      <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/80 px-3 py-6 text-center text-sm text-zinc-500">
        Not enough structured points for a chart on this pattern.
      </p>
    );
  }

  if (chart.kind === "hour_of_day") {
    const lineData = chart.points.map((p) => ({
      hour: p.hour,
      meanMgdl: p.meanMgdl,
      label: hourTick(p.hour),
    }));
    return (
      <div className="h-[220px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={lineData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200" />
            <XAxis dataKey="hour" tickFormatter={hourTick} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} width={36} />
            <Tooltip
              formatter={(v) => {
                const n = tooltipNumber(v);
                return [n != null ? `${Math.round(n)} mg/dL` : "—", "Avg"];
              }}
              labelFormatter={(_, payload) => {
                const h = payload?.[0]?.payload?.hour;
                return h != null ? `Hour ${hourTick(h)}` : "";
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
            <Line type="monotone" dataKey="meanMgdl" stroke="#6d28d9" strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chart.kind === "scatter_steps_mgdl") {
    const pts = chart.points.map((p) => ({
      ...p,
      key: p.ymd,
    }));
    return (
      <div className="h-[240px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200" />
            <XAxis type="number" dataKey="steps" name="Steps" tick={{ fontSize: 10 }} />
            <YAxis type="number" dataKey="meanMgdl" name="mg/dL" tick={{ fontSize: 10 }} width={36} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              formatter={(v, n) => {
                const num = tooltipNumber(v);
                const name = String(n ?? "");
                if (num == null) return ["—", name === "meanMgdl" ? "Avg glucose" : "Steps"];
                return [
                  name === "meanMgdl" ? `${num} mg/dL` : num,
                  name === "meanMgdl" ? "Avg glucose" : "Steps",
                ];
              }}
              labelFormatter={(_, p) => p?.[0]?.payload?.ymd ?? ""}
            />
            <ReferenceLine
              x={chart.thresholdSteps}
              stroke="#64748b"
              strokeDasharray="5 5"
              label={{ value: `${chart.thresholdSteps.toLocaleString()} steps`, position: "top", fontSize: 10 }}
            />
            <Scatter data={pts} fill="#0284c7" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chart.kind === "bars_session_delta") {
    const data = chart.items.map((it) => ({
      name: `${it.startYmd ?? ""} · ${it.label}`.replace(/^ · /, "").slice(0, 36),
      delta: it.deltaMgdl,
      fill: it.deltaMgdl >= 0 ? "#c2410c" : "#1d4ed8",
    }));
    return (
      <div className="h-[220px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 9 }} />
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
    );
  }

  if (chart.kind === "two_bar") {
    const data = [
      { name: chart.left.label.slice(0, 28), mgdl: chart.left.valueMgdl },
      { name: chart.right.label.slice(0, 28), mgdl: chart.right.valueMgdl },
    ];
    return (
      <div className="h-[200px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 32 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={48} />
            <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} width={36} />
            <Tooltip
              formatter={(v) => {
                const n = tooltipNumber(v);
                return [n != null ? `${Math.round(n)} mg/dL` : "—", "Average"];
              }}
            />
            <ReferenceLine y={targetLow} stroke="#94a3b8" strokeDasharray="4 4" />
            <ReferenceLine y={targetHigh} stroke="#94a3b8" strokeDasharray="4 4" />
            <Bar dataKey="mgdl" fill="#7c3aed" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
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
          className="text-lg leading-none text-align-muted transition group-hover:text-align-forest"
          aria-hidden
        >
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <div id={panelId} className="mt-3 space-y-3 text-sm">
          <SectionBlock label="Window">
            <p className="text-sm leading-relaxed text-zinc-700">{learnMore.windowSummary}</p>
          </SectionBlock>

          <SectionBlock label="How we calculated this">
            <p className="text-sm leading-relaxed text-zinc-700">{learnMore.explanation}</p>
          </SectionBlock>

          <SectionBlock label="Example dates in this pattern">
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

          <SectionBlock label="Underlying trend">
            <div className="rounded-lg border border-zinc-200/90 bg-white p-2 shadow-sm">
              <EvidenceChartInner
                chart={learnMore.chart}
                targetLow={targetLowMgdl}
                targetHigh={targetHighMgdl}
              />
            </div>
          </SectionBlock>

          <p className="rounded-lg bg-zinc-100/80 px-3 py-2 text-[11px] leading-relaxed text-zinc-600">
            This is descriptive only—not medical advice. Discuss changes with your care team.
          </p>
        </div>
      ) : null}
    </div>
  );
}
