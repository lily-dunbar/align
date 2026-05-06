import "server-only";

import type {
  PatternEvidenceChart,
  PatternFeatureContext,
  PatternInsightJson,
  PatternLearnMore,
} from "@/lib/patterns/types";

const LONG_RUN_M = 2 * 1609.34;
const MAX_SAMPLE_DAYS = 14;

function heuristicStem(id: string): string {
  return id.replace(/-[a-f0-9]{8}$/i, "");
}

function baseNote(): string {
  return `Shown in your pattern time zone. Chips list up to ${MAX_SAMPLE_DAYS} example dates; hourly charts also trace individual days when CGM coverage allows.`;
}

const OVERLAY_DAY_CAP = 20;

function pickOverlayDays(
  curves: PatternFeatureContext["evidence"]["hourlyCurvesByDay"],
): { ymd: string; hourMeanMgdl: (number | null)[] }[] | undefined {
  if (!curves.length) return undefined;
  if (curves.length <= OVERLAY_DAY_CAP) return curves;
  const step = (curves.length - 1) / (OVERLAY_DAY_CAP - 1);
  const out: typeof curves = [];
  for (let i = 0; i < OVERLAY_DAY_CAP; i += 1) {
    out.push(curves[Math.round(i * step)]!);
  }
  return out;
}

function hourChart(ctx: PatternFeatureContext, shade?: [number, number][]): PatternEvidenceChart {
  const t = ctx.temporal;
  const points = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    meanMgdl: t.hourMeanMgdl[hour] ?? null,
  }));
  const overlayDays = pickOverlayDays(ctx.evidence.hourlyCurvesByDay);
  return { kind: "hour_of_day", points, shadeRanges: shade, overlayDays };
}

function ymdIsWeekend(ymd: string): boolean {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dow === 0 || dow === 6;
}

function weekdayWeekendHourProfileChart(ctx: PatternFeatureContext): PatternEvidenceChart {
  const weekdaySums = new Array<number>(24).fill(0);
  const weekdayCounts = new Array<number>(24).fill(0);
  const weekendSums = new Array<number>(24).fill(0);
  const weekendCounts = new Array<number>(24).fill(0);

  for (const d of ctx.evidence.hourlyCurvesByDay) {
    const isWeekend = ymdIsWeekend(d.ymd);
    for (let h = 0; h < 24; h += 1) {
      const mgdl = d.hourMeanMgdl[h];
      if (mgdl == null || !Number.isFinite(mgdl)) continue;
      if (isWeekend) {
        weekendSums[h] += mgdl;
        weekendCounts[h] += 1;
      } else {
        weekdaySums[h] += mgdl;
        weekdayCounts[h] += 1;
      }
    }
  }

  const points = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    weekdayMeanMgdl:
      weekdayCounts[hour] > 0 ? Math.round(weekdaySums[hour] / weekdayCounts[hour]) : null,
    weekendMeanMgdl:
      weekendCounts[hour] > 0 ? Math.round(weekendSums[hour] / weekendCounts[hour]) : null,
  }));

  return {
    kind: "dual_hour_profile",
    points,
    caption:
      "Weekday vs weekend aggregate curves by local clock hour (Mon-Fri vs Sat-Sun).",
  };
}

function isWeekdayWeekendComparisonInsight(p: PatternInsightJson, stem: string): boolean {
  if (
    stem.startsWith("temporal-weekday-weekend") ||
    stem === "demo-temporal-weekday" ||
    stem === "demo-temporal-weekend"
  ) {
    return true;
  }
  const haystack = `${p.title} ${p.description}`.toLowerCase();
  return (
    p.type === "Temporal" &&
    haystack.includes("weekday") &&
    haystack.includes("weekend")
  );
}

function sampleDays(ymds: string[]): string[] {
  const u = [...new Set(ymds)].sort();
  return u.slice(-MAX_SAMPLE_DAYS);
}

export function attachLearnMoreToPatterns(
  patterns: PatternInsightJson[],
  ctx: PatternFeatureContext,
): PatternInsightJson[] {
  return patterns.map((p) => ({
    ...p,
    learnMore: buildLearnMore(p, ctx),
  }));
}

function buildLearnMore(p: PatternInsightJson, ctx: PatternFeatureContext): PatternLearnMore {
  const stem = heuristicStem(p.id);
  const ev = ctx.evidence;
  const s = ctx.sessions;
  const st = ctx.steps;

  if (stem === "demo-temporal-lunch") {
    return {
      explanation:
        "The thick curve is your average glucose by clock hour for the dates you selected. Faint curves are individual local days on the same 24-hour axis so you can see how repeatable the post-lunch bump is versus one-off noise. The shaded band highlights the lunch-to-early-afternoon window.",
      contributingDaysYmd: sampleDays(ev.cgmDaysSample),
      contributingNote: baseNote(),
      chart: hourChart(ctx, [[11, 13]]),
    };
  }

  if (stem.startsWith("temporal-dinner-morning") || stem === "demo-temporal-dinner") {
    return {
      explanation:
        "We compare two slices of the day: morning (6am–11am) vs early evening (6–9pm) local time. The thick line is the overall hourly average; faint lines are single days so you can see whether the morning vs evening gap is consistent or driven by a few dates.",
      contributingDaysYmd: sampleDays(ev.cgmDaysSample),
      contributingNote: baseNote(),
      chart: hourChart(ctx, [
        [6, 11],
        [18, 21],
      ]),
    };
  }

  if (
    stem.startsWith("temporal-peak-trough") ||
    stem.startsWith("temporal-bands") ||
    stem.startsWith("temporal-afternoon-night")
  ) {
    return {
      explanation:
        "Dexcom points are bucketed by hour (or wider bands when noted in the card). The thick line is the average trace for your filter; faint lines are individual days so peaks and troughs are not just one bad afternoon.",
      contributingDaysYmd: sampleDays(ev.cgmDaysSample),
      contributingNote: baseNote(),
      chart: hourChart(ctx),
    };
  }

  if (stem.startsWith("temporal-evening-630")) {
    return {
      explanation:
        "We count how often evening readings sit above your high target between 6–9pm, then show where that fits on the hourly curve. Faint day-lines show whether those evenings are a steady pattern or a few outliers.",
      contributingDaysYmd: sampleDays(ev.cgmDaysSample),
      contributingNote: baseNote(),
      chart: hourChart(ctx, [[18, 21]]),
    };
  }

  if (isWeekdayWeekendComparisonInsight(p, stem)) {
    const tw = ctx.temporal.weekdayMeanMgdl;
    const we = ctx.temporal.weekendMeanMgdl;
    if (tw != null || we != null) {
      return {
        explanation:
          "Every Dexcom reading in the selected window is tagged weekday (Mon-Fri) or weekend (Sat-Sun) using your pattern time zone. The chart overlays two aggregate hourly curves so you can compare shape and level across the day, not just one overall average.",
        contributingDaysYmd: sampleDays(ev.cgmDaysSample),
        contributingNote: baseNote(),
        chart: weekdayWeekendHourProfileChart(ctx),
      };
    }
    return {
      explanation:
        "We still split readings by weekday vs weekend in your zone, but there are not enough samples yet to plot both curves clearly. Try a longer window for a stronger comparison.",
      contributingDaysYmd: sampleDays(ev.cgmDaysSample),
      contributingNote: baseNote(),
      chart: hourChart(ctx),
    };
  }

  if (stem.startsWith("temporal-sparse") || stem.startsWith("temporal-none")) {
    return {
      explanation:
        "There is not enough Dexcom data in this window to trust hour-by-hour averages yet. Keep syncing or choose a longer range.",
      contributingDaysYmd: sampleDays(ev.cgmDaysSample),
      contributingNote: baseNote(),
      chart: hourChart(ctx),
    };
  }

  if (stem.startsWith("steps-threshold") || p.type === "Steps") {
    const th = st.activeDayStepsThreshold;
    const pts = ev.dailyGlucoseSteps;
    const highYm = pts.filter((x) => x.steps >= th).map((x) => x.ymd);
    const lowYm = pts.filter((x) => x.steps < th).map((x) => x.ymd);
    const contrib = sampleDays([
      ...highYm.slice(0, Math.ceil(MAX_SAMPLE_DAYS / 2)),
      ...lowYm.slice(0, Math.ceil(MAX_SAMPLE_DAYS / 2)),
    ]);
    return {
      explanation: `Each dot is one local day: total steps on the horizontal axis, that day’s average glucose on the vertical. The dashed line is ${th.toLocaleString()} steps—teal dots are at or above it, blue dots are quieter days. That split is what the headline compares (not hour-by-hour step curves).`,
      contributingDaysYmd: contrib.length ? contrib : sampleDays(ev.cgmDaysSample),
      contributingNote: baseNote(),
      chart: {
        kind: "scatter_steps_mgdl",
        points: pts,
        thresholdSteps: th,
      },
    };
  }

  if (stem.startsWith("sess-longrun-delta") || stem === "demo-sessions-longrun") {
    const items = ev.sessionDeltas
      .filter((d) => d.distanceMeters != null && d.distanceMeters >= LONG_RUN_M)
      .map((d) => ({
        label: d.label,
        deltaMgdl: d.deltaMgdl,
        startYmd: d.startYmd,
      }));
    const ymds = [...new Set(items.map((i) => i.startYmd))].sort();
    return {
      explanation:
        "Each bar is one qualifying run (about 2 miles or farther, when distance is logged). We take average glucose during the workout versus roughly the 90 minutes before you started. Negative bars mean glucose was lower during the effort than just before—common with cardio; positive means it rose. Bars are sorted by date in the tooltip; the card headline summarizes typical size of that swing.",
      contributingDaysYmd: sampleDays(ymds.length ? ymds : ev.cgmDaysSample),
      contributingNote: baseNote(),
      chart:
        items.length > 0
          ? { kind: "bars_session_delta", items: items.slice(0, 16) }
          : { kind: "empty" },
    };
  }

  if (stem.startsWith("sess-proximity")) {
    const near = s.meanMgdlNearWorkout2h;
    const away = s.meanMgdlAwayFromWorkout2h;
    if (near != null && away != null) {
      const ymds = [...new Set(ev.sessionDeltas.map((d) => d.startYmd))].sort();
      return {
        explanation:
          "Two simple buckets: readings within about two hours after a workout start versus everything else in this filter. Taller bar = higher average glucose in that bucket. Movement, meals, and timing mix together here, so use this as a descriptive split, not proof of cause.",
        contributingDaysYmd: sampleDays(ymds.length ? ymds : ev.cgmDaysSample),
        contributingNote: baseNote(),
        chart: {
          kind: "two_bar",
          left: { label: "Near workout (~2h)", valueMgdl: Math.round(near) },
          right: { label: "Rest of window", valueMgdl: Math.round(away) },
        },
      };
    }
  }

  if (
    stem.startsWith("sess-run-delta") ||
    stem === "demo-sessions-activity" ||
    (stem.startsWith("llm-") && p.type === "Sessions")
  ) {
    const items = ev.sessionDeltas.map((d) => ({
      label: d.label,
      deltaMgdl: d.deltaMgdl,
      startYmd: d.startYmd,
    }));
    const ymds = [...new Set(ev.sessionDeltas.map((d) => d.startYmd))].sort();
    return {
      explanation:
        "Same before-vs-during comparison as the long-run card, but including shorter sessions when distance or type still looks run-like. Each bar is one workout; hover for date and label.",
      contributingDaysYmd: sampleDays(ymds.length ? ymds : ev.cgmDaysSample),
      contributingNote: baseNote(),
      chart:
        items.length > 0
          ? { kind: "bars_session_delta", items: items.slice(0, 16) }
          : { kind: "empty" },
    };
  }

  if (stem.startsWith("sess-none") || stem.startsWith("sess-thin")) {
    return {
      explanation:
        stem.startsWith("sess-none")
          ? "No workouts with a start time fell in this rolling window, so we cannot score movement-linked glucose yet."
          : "Workouts exist but we rarely had Dexcom data both shortly before and during a start, so the before-vs-during comparison is still thin.",
      contributingDaysYmd: sampleDays(ev.cgmDaysSample),
      contributingNote: baseNote(),
      chart: hourChart(ctx),
    };
  }

  if (p.type === "Temporal") {
    return {
      explanation:
        "Dexcom readings are averaged by clock hour in your time zone for the range you picked. The thick curve is that average; faint lines are individual days overlaid so you can judge whether the pattern is repeatable.",
      contributingDaysYmd: sampleDays(ev.cgmDaysSample),
      contributingNote: baseNote(),
      chart: hourChart(ctx),
    };
  }

  if (p.type === "Sessions") {
    const items = ev.sessionDeltas.map((d) => ({
      label: d.label,
      deltaMgdl: d.deltaMgdl,
      startYmd: d.startYmd,
    }));
    const ymds = [...new Set(ev.sessionDeltas.map((d) => d.startYmd))].sort();
    return {
      explanation:
        "Where Dexcom has enough coverage before and during a logged workout, we plot the glucose change for that session. Bars below zero usually mean glucose fell during the effort versus the minutes leading up to it.",
      contributingDaysYmd: sampleDays(ymds.length ? ymds : ev.cgmDaysSample),
      contributingNote: baseNote(),
      chart:
        items.length > 0
          ? { kind: "bars_session_delta", items: items.slice(0, 16) }
          : { kind: "empty" },
    };
  }

  return {
    explanation:
      "This chart echoes the same numbers as the card above: hourly averages with optional per-day overlays, or session deltas, depending on the insight type.",
    contributingDaysYmd: sampleDays(ev.cgmDaysSample),
    contributingNote: baseNote(),
    chart: hourChart(ctx),
  };
}
