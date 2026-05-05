/** Minimum distinct local days with Dexcom needed for a readable Insights window. */
export function minDexcomDaysForWindow(labelDays: number): number {
  if (labelDays <= 7) return 2;
  if (labelDays <= 30) return 5;
  return 14;
}
