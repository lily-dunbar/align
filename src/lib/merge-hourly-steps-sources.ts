/** When both Shortcut ingest and Shortcuts file exist for the same hour, prefer `shortcuts_file`. */
export function mergeHourlyStepsPreferShortcutsFile<
  T extends { bucketStart: Date; stepCount: number; source: string },
>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const r of rows) {
    const k = r.bucketStart.toISOString();
    const prev = map.get(k);
    if (!prev || r.source === "shortcuts_file") map.set(k, r);
  }
  return [...map.values()].sort((a, b) => a.bucketStart.getTime() - b.bucketStart.getTime());
}
