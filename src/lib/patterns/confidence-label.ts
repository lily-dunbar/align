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
