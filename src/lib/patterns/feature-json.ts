import "server-only";

import { cache } from "react";

import { buildDemoPatternsFeatureJson } from "@/lib/demo/build-demo-patterns-api";
import { isDemoDataActive } from "@/lib/demo/is-demo-data-active";
import { attachLearnMoreToPatterns } from "@/lib/patterns/enrich-pattern-learn-more";
import { buildHeuristicPatterns } from "@/lib/patterns/heuristics";
import { fetchLlmPatterns } from "@/lib/patterns/llm";
import { loadPatternFeatureContext } from "@/lib/patterns/stats";
import { selectPatternsForDisplay } from "@/lib/patterns/select-for-display";
import type { PatternInsightJson, PatternsFeatureJson, PatternWindow } from "@/lib/patterns/types";
import { rollingRangeUtc } from "@/lib/patterns/window";
import { getUserPreferences } from "@/lib/user-display-preferences";

/** Keep only patterns whose confidence meets or exceeds the user’s Pattern threshold (settings). */
function applyThreshold(
  patterns: PatternInsightJson[],
  thresholdPercent: number,
): PatternInsightJson[] {
  return patterns.filter((p) => p.confidencePercent >= thresholdPercent);
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
    patterns = attachLearnMoreToPatterns(selectPatternsForDisplay(filtered), featureContext);
    source = "anthropic";
  } else {
    patterns = attachLearnMoreToPatterns(
      selectPatternsForDisplay(applyThreshold(heuristics, threshold)),
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
