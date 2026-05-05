/** US customary miles — matches manual workout entry (`manual-entry-panel`). */
export const METERS_PER_MILE = 1609.344;

/** Rounded miles for display / aggregates (default one decimal). */
export function metersToMilesDisplay(meters: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round((meters / METERS_PER_MILE) * f) / f;
}
