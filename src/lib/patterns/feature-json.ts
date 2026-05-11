import "server-only";

import { formatInTimeZone } from "date-fns-tz";
import { unstable_cache } from "next/cache";
import { cache } from "react";

import { buildDemoPatternsFeatureJson } from "@/lib/demo/build-demo-patterns-api";
import { isDemoDataActive } from "@/lib/demo/is-demo-data-active";
import { attachLearnMoreToPatterns } from "@/lib/patterns/enrich-pattern-learn-more";
import { buildHeuristicPatterns } from "@/lib/patterns/heuristics";
import { fetchLlmPatterns } from "@/lib/patterns/llm";
import { loadPatternFeatureContext } from "@/lib/patterns/stats";
import { selectPatternsForDisplay } from "@/lib/patterns/select-for-display";
import type {
  PatternFeatureContext,
  PatternInsightJson,
  PatternsFeatureJson,
  PatternWindow,
} from "@/lib/patterns/types";
import { rollingRangeUtc } from "@/lib/patterns/window";
import { getUserPreferences } from "@/lib/user-display-preferences";

/** Keep only patterns whose confidence meets or exceeds the user’s Pattern threshold (settings). */
function applyThreshold(
  patterns: PatternInsightJson[],
  thresholdPercent: number,
): PatternInsightJson[] {
  return patterns.filter((p) => p.confidencePercent >= thresholdPercent);
}

function reconcileSessionCardDeltaText(
  patterns: PatternInsightJson[],
  ctx: PatternFeatureContext,
): PatternInsightJson[] {
  const p25 = ctx.sessions.deltaMgdlP25LongRunMi;
  const p75 = ctx.sessions.deltaMgdlP75LongRunMi;
  const avg = ctx.sessions.avgMgdlDeltaRunLikeOverLongRunMi;
  if (avg == null) return patterns;

  const avgRounded = Math.round(avg);
  const mixedByTinyAverage = Math.abs(avgRounded) < 8;
  const mixedByStraddle = p25 != null && p75 != null && Math.min(p25, p75) < 0 && Math.max(p25, p75) > 0;
  const mixed = mixedByTinyAverage || mixedByStraddle;
  if (!mixed) return patterns;

  const longRunDeltas = ctx.evidence.sessionDeltas
    .filter((d) => d.distanceMeters != null && d.distanceMeters >= 2 * 1609.34)
    .map((d) => d.deltaMgdl)
    .filter((n) => Number.isFinite(n));
  const maxRise = longRunDeltas.length ? Math.max(...longRunDeltas) : null;
  const maxDrop = longRunDeltas.length ? Math.min(...longRunDeltas) : null;
  const riseMag = maxRise != null && maxRise > 0 ? Math.round(maxRise) : null;
  const dropMag = maxDrop != null && maxDrop < 0 ? Math.abs(Math.round(maxDrop)) : null;

  return patterns.map((p) => {
    if (p.type !== "Sessions") return p;
    const haystack = `${p.title} ${p.description}`.toLowerCase();
    const isRunDeltaCard =
      haystack.includes("run") &&
      (haystack.includes("90") ||
        haystack.includes("before") ||
        haystack.includes("during") ||
        haystack.includes("mile") ||
        haystack.includes(" mi"));
    if (!isRunDeltaCard) return p;

    if (riseMag != null && (dropMag == null || riseMag >= dropMag)) {
      return {
        ...p,
        title: `Some runs rise by up to ~${riseMag} mg/dL`,
        description:
          "Across logged longer runs in this window, session deltas vary run to run, but the largest observed rise is around this value versus the ~90 minutes before start.",
      };
    }

    if (dropMag != null) {
      return {
        ...p,
        title: `Some runs drop by up to ~${dropMag} mg/dL`,
        description:
          "Across logged longer runs in this window, session deltas vary run to run, but the largest observed drop is around this value versus the ~90 minutes before start.",
      };
    }

    return p;
  });
}

/** Deduped when multiple RSC branches load the same window in one request — pass the same `atIso`. */
export const getPatternsFeatureJsonForIso = cache(
  async (
    userId: string,
    window: PatternWindow,
    timeZone: string,
    atIso: string,
  ): Promise<PatternsFeatureJson> => {
    return getPatternsFeatureJsonImpl(userId, window, timeZone, new Date(atIso));
  },
);

/** Product policy: LLM may emit Steps only for day-level thresholds; no post-filter. */
export async function getPatternsFeatureJson(
  userId: string,
  window: PatternWindow,
  timeZone: string,
  at: Date = new Date(),
): Promise<PatternsFeatureJson> {
  return getPatternsFeatureJsonForIso(userId, window, timeZone, at.toISOString());
}

async function getPatternsFeatureJsonImpl(
  userId: string,
  window: PatternWindow,
  timeZone: string,
  at: Date,
): Promise<PatternsFeatureJson> {
  const prefs = await getUserPreferences(userId);
  const { startUtc, endUtcExclusive, labelDays } = rollingRangeUtc(window, at);

  if (await isDemoDataActive(userId)) {
    return buildDemoPatternsFeatureJson({
      window,
      timeZone,
      prefs,
      startUtc,
      endUtcExclusive,
      labelDays,
    });
  }

  /** One LLM+stats build per user / window / zone / local calendar day; cleared via `revalidateTag`. */
  const anchorYmd = formatInTimeZone(at, timeZone, "yyyy-MM-dd");
  const run = unstable_cache(
    async () => computePatternsFeatureJsonForUser(userId, window, timeZone, at),
    ["align-patterns-feature-v1", userId, window, timeZone, anchorYmd],
    { tags: [`patterns-insights:${userId}`], revalidate: false },
  );
  return run();
}

async function computePatternsFeatureJsonForUser(
  userId: string,
  window: PatternWindow,
  timeZone: string,
  at: Date,
): Promise<PatternsFeatureJson> {
  const prefs = await getUserPreferences(userId);
  const { startUtc, endUtcExclusive, labelDays } = rollingRangeUtc(window, at);

  const featureContext = await loadPatternFeatureContext(
    userId,
    window,
    startUtc,
    endUtcExclusive,
    timeZone,
    prefs,
  );

  const threshold = prefs.patternThresholdPercent;
  const heuristics = buildHeuristicPatterns(featureContext);

  let patterns: PatternInsightJson[];
  let source: PatternsFeatureJson["source"];

  const llmOutcome = await fetchLlmPatterns({ window, context: featureContext });

  if (llmOutcome.kind === "ok") {
    const filtered = llmOutcome.patterns.filter((p) => p.confidencePercent >= threshold);
    const selected = selectPatternsForDisplay(filtered);
    patterns = attachLearnMoreToPatterns(
      reconcileSessionCardDeltaText(selected, featureContext),
      featureContext,
    );
    source = "anthropic";
  } else {
    const selected = selectPatternsForDisplay(applyThreshold(heuristics, threshold));
    patterns = attachLearnMoreToPatterns(
      reconcileSessionCardDeltaText(selected, featureContext),
      featureContext,
    );
    source = "heuristic";
  }

  return {
    window,
    range: {
      startUtc: startUtc.toISOString(),
      endUtcExclusive: endUtcExclusive.toISOString(),
      labelDays,
    },
    timeZone,
    patternThresholdPercent: threshold,
    generatedAt: new Date().toISOString(),
    source,
    patterns,
    featureContext,
  };
}
