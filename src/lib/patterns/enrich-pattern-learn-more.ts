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
  return `Dates use your pattern time zone. We show up to ${MAX_SAMPLE_DAYS} examples; totals in the summary cover the whole window.`;
}

function windowSummaryLine(ctx: PatternFeatureContext): string {
  const i = ctx.inclusion;
  return `${i.rangeStartYmd} → ${i.rangeEndYmd} · ${i.daysWithCgm} days with Dexcom data · ${i.daysWithSteps} days with steps · ${i.activitiesCount} activities`;
}

function hourChart(ctx: PatternFeatureContext, shade?: [number, number][]): PatternEvidenceChart {
  const t = ctx.temporal;
  const points = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    meanMgdl: t.hourMeanMgdl[hour] ?? null,
  }));
  return { kind: "hour_of_day", points, shadeRanges: shade };
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

  if (stem.startsWith("temporal-dinner-morning") || stem === "demo-temporal-dinner") {
    return {
      explanation:
        "We average Dexcom glucose readings in local morning hours (6–11am) and compare that average to readings in early evening (6–9pm). The headline is the difference between those two averages, using only data in your selected window.",
      windowSummary: windowSummaryLine(ctx),
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
        "Dexcom readings are grouped by clock hour or day-part, then we compare averages. The line is average mg/dL per hour when there are enough samples that hour.",
      windowSummary: windowSummaryLine(ctx),
      contributingDaysYmd: sampleDays(ev.cgmDaysSample),
      contributingNote: baseNote(),
      chart: hourChart(ctx),
    };
  }

  if (stem.startsWith("temporal-evening-630")) {
    return {
      explanation:
        "We flag local days between 6–9pm where Dexcom data shows glucose above your high target, then summarize how often that shows up in this window. The shaded band marks those evening hours on the hourly curve.",
      windowSummary: windowSummaryLine(ctx),
      contributingDaysYmd: sampleDays(ev.cgmDaysSample),
      contributingNote: baseNote(),
      chart: hourChart(ctx, [[18, 21]]),
    };
  }

  if (stem.startsWith("temporal-weekday-weekend") || stem === "demo-temporal-weekday") {
    return {
      explanation:
        "Each Dexcom reading is tagged weekday (Mon–Fri) or weekend (Sat–Sun) in your zone, then we compare average glucose for each group. The chart still shows the hourly shape for context.",
      windowSummary: windowSummaryLine(ctx),
      contributingDaysYmd: sampleDays(ev.cgmDaysSample),
      contributingNote: baseNote(),
      chart: hourChart(ctx),
    };
  }

  if (stem.startsWith("temporal-sparse") || stem.startsWith("temporal-none")) {
    return {
      explanation:
        "There is not enough Dexcom data in this window to trust hour-by-hour averages yet. Keep syncing or choose a longer range.",
      windowSummary: windowSummaryLine(ctx),
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
      explanation: `We split local days by total step count (at or above ${th.toLocaleString()} vs below). For each day we use average glucose from Dexcom when that day has enough coverage. The scatterplot is one dot per qualifying day: steps on the horizontal axis, average mg/dL on the vertical axis.`,
      windowSummary: windowSummaryLine(ctx),
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
        "Each bar is one qualifying run (about 2 miles or farther): during-session average glucose minus roughly the 90 minutes before start (Dexcom). Values below zero mean blood sugar was lower during the run than right beforehand—often from activity; above zero means it rose during the effort. The card headline summarizes how large that change tends to be in this window.",
      windowSummary: windowSummaryLine(ctx),
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
          "We split Dexcom glucose readings into two buckets: those within about two hours of any workout start in the window, and everything else. The bars are simple averages of those two buckets—not a causal claim.",
        windowSummary: windowSummaryLine(ctx),
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

  if (stem.startsWith("sess-run-delta") || (stem.startsWith("llm-") && p.type === "Sessions")) {
    const items = ev.sessionDeltas.map((d) => ({
      label: d.label,
      deltaMgdl: d.deltaMgdl,
      startYmd: d.startYmd,
    }));
    const ymds = [...new Set(ev.sessionDeltas.map((d) => d.startYmd))].sort();
    return {
      explanation:
        "For each run-like workout we compare average Dexcom glucose during the session to the average in ~90 minutes before you started (when we have enough readings in both slices).",
      windowSummary: windowSummaryLine(ctx),
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
      windowSummary: windowSummaryLine(ctx),
      contributingDaysYmd: sampleDays(ev.cgmDaysSample),
      contributingNote: baseNote(),
      chart: hourChart(ctx),
    };
  }

  if (p.type === "Temporal") {
    return {
      explanation:
        "This insight comes from grouping Dexcom glucose by clock hour (local time) and comparing averages across your selected range.",
      windowSummary: windowSummaryLine(ctx),
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
        "We look at Dexcom glucose around logged Strava or manual workouts in this window—chiefly before versus during sessions when the data supports it.",
      windowSummary: windowSummaryLine(ctx),
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
      "Align compares averages over your rolling window. The chart uses the same underlying stats as the headline, regardless of whether the text came from our model or built-in rules.",
    windowSummary: windowSummaryLine(ctx),
    contributingDaysYmd: sampleDays(ev.cgmDaysSample),
    contributingNote: baseNote(),
    chart: hourChart(ctx),
  };
}
