import "server-only";

import { buildHeuristicPatterns } from "@/lib/patterns/heuristics";
import { fetchLlmPatterns } from "@/lib/patterns/llm";
import { loadPatternFeatureContext } from "@/lib/patterns/stats";
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

function sortPatternsByConfidence(patterns: PatternInsightJson[]): PatternInsightJson[] {
  return [...patterns].sort((a, b) => b.confidencePercent - a.confidencePercent);
}

export async function getPatternsFeatureJson(
  userId: string,
  window: PatternWindow,
  timeZone: string,
  at: Date = new Date(),
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
    const filtered = llmOutcome.patterns.filter(
      (p) => p.confidencePercent >= threshold,
    );
    patterns = filtered;
    source = "anthropic";
  } else {
    patterns = applyThreshold(heuristics, threshold);
    source = "heuristic";
  }

  patterns = sortPatternsByConfidence(patterns);

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
