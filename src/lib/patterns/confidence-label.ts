export type ConfidenceTier = "high" | "moderate" | "low";

/** Same thresholds as {@link humanConfidenceLabel} / {@link confidenceBadgeLabel}. */
export function confidenceTier(percent: number): ConfidenceTier {
  if (percent >= 85) return "high";
  if (percent >= 65) return "moderate";
  return "low";
}

/** Human-readable confidence line for pattern cards (numeric % stays in JSON for thresholding). */
export function humanConfidenceLabel(percent: number): string {
  if (percent >= 85) return "High confidence";
  if (percent >= 65) return "Moderate confidence";
  return "Low confidence — more data will sharpen this";
}

/** Short badge label (title case) for compact pattern insight UI. */
export function confidenceBadgeLabel(percent: number): string {
  if (percent >= 85) return "High Confidence";
  if (percent >= 65) return "Moderate Confidence";
  return "Low Confidence";
}

/** Original pill look: forest text on soft green (see pattern insight cards). */
export const CONFIDENCE_BADGE_SURFACE_CLASS =
  "inline-flex rounded-full bg-align-nav-active px-2.5 py-1 text-xs font-medium text-align-forest transition-opacity duration-200";

/**
 * Opacity for the whole pill: higher `confidencePercent` → closer to 1 (more visible),
 * lower → more transparent. Same hues as {@link CONFIDENCE_BADGE_SURFACE_CLASS}.
 */
export function confidenceBadgeOpacity(percent: number): number {
  const clamped = Math.max(0, Math.min(100, percent));
  return 0.45 + (clamped / 100) * 0.55;
}
