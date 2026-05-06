/**
 * Collapse duplicate `(userId, bucket_start)` rows from different `source` values.
 * Prefer the row with the latest `received_at` so a fresh Shortcut POST wins over
 * an older iCloud file row (file rows often stayed authoritative before and hid ingest).
 */
export function mergeHourlyStepsPreferShortcutsFile<
  T extends { bucketStart: Date; stepCount: number; source: string; receivedAt?: Date },
>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const r of rows) {
    const k = r.bucketStart.toISOString();
    const prev = map.get(k);
    const nextMs = r.receivedAt?.getTime() ?? 0;
    const prevMs = prev?.receivedAt?.getTime() ?? 0;
    if (!prev || nextMs >= prevMs) map.set(k, r);
  }
  return [...map.values()].sort((a, b) => a.bucketStart.getTime() - b.bucketStart.getTime());
}
