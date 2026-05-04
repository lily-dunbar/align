import type { PatternInsightJson } from "@/lib/patterns/types";

export function sortPatternsByConfidence(patterns: PatternInsightJson[]): PatternInsightJson[] {
  return [...patterns].sort((a, b) => b.confidencePercent - a.confidencePercent);
}

const MAX_PATTERN_CARDS = 4;
const MAX_PER_TYPE_FOR_BALANCE = 2;
const MAX_STEPS_CARDS_FIRST_PASS = 1;

/**
 * Surfaces up to four patterns: strongest by confidence, balanced across Temporal vs Sessions when possible.
 */
export function selectPatternsForDisplay(patterns: PatternInsightJson[]): PatternInsightJson[] {
  const sorted = sortPatternsByConfidence(patterns);
  const chosen: PatternInsightJson[] = [];
  const chosenIds = new Set<string>();
  let nTemporal = 0;
  let nSessions = 0;
  let nSteps = 0;

  const tryAddBalanced = (p: PatternInsightJson) => {
    if (chosen.length >= MAX_PATTERN_CARDS || chosenIds.has(p.id)) return false;
    if (p.type === "Temporal" && nTemporal >= MAX_PER_TYPE_FOR_BALANCE) return false;
    if (p.type === "Sessions" && nSessions >= MAX_PER_TYPE_FOR_BALANCE) return false;
    if (p.type === "Steps" && nSteps >= MAX_STEPS_CARDS_FIRST_PASS) return false;
    chosen.push(p);
    chosenIds.add(p.id);
    if (p.type === "Temporal") nTemporal += 1;
    if (p.type === "Sessions") nSessions += 1;
    if (p.type === "Steps") nSteps += 1;
    return true;
  };

  for (const p of sorted) {
    if (chosen.length >= MAX_PATTERN_CARDS) break;
    tryAddBalanced(p);
  }
  for (const p of sorted) {
    if (chosen.length >= MAX_PATTERN_CARDS) break;
    if (!chosenIds.has(p.id)) {
      chosen.push(p);
      chosenIds.add(p.id);
    }
  }
  return sortPatternsByConfidence(chosen);
}
