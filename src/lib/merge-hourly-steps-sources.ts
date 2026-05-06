/**
 * Collapse duplicate `(userId, bucket_start)` rows from different `source` values.
 * Prefer the row with the strongest signal for the hour:
 * 1) Higher `stepCount` wins (so newer/higher values are not hidden by stale overlaps).
 * 2) If counts tie, latest `receivedAt` wins.
 */
export function mergeHourlyStepsPreferShortcutsFile<
  T extends { bucketStart: Date; stepCount: number; source: string; receivedAt?: Date },
>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const r of rows) {
    const k = r.bucketStart.toISOString();
    const prev = map.get(k);
    if (!prev) {
      map.set(k, r);
      continue;
    }

    if (r.stepCount > prev.stepCount) {
      map.set(k, r);
      continue;
    }
    if (r.stepCount < prev.stepCount) {
      continue;
    }

    const nextMs = r.receivedAt?.getTime() ?? 0;
    const prevMs = prev.receivedAt?.getTime() ?? 0;
    if (nextMs >= prevMs) map.set(k, r);
  }
  return [...map.values()].sort((a, b) => a.bucketStart.getTime() - b.bucketStart.getTime());
}
