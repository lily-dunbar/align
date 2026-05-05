export type SleepRecurrenceFreq = "daily" | "weekly";

export type SleepRecurrenceMeta = {
  v: 1;
  seriesId: string;
  freq: SleepRecurrenceFreq;
  anchorSleepStartIso: string;
};

const RECURRENCE_PREFIX = "__align_sleep_recur__";

export function parseSleepRecurrenceMeta(notes: string | null | undefined): SleepRecurrenceMeta | null {
  if (!notes) return null;
  const n = notes.trim();
  if (!n.startsWith(RECURRENCE_PREFIX)) return null;
  const raw = n.slice(RECURRENCE_PREFIX.length).trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SleepRecurrenceMeta>;
    if (
      parsed.v !== 1 ||
      !parsed.seriesId ||
      (parsed.freq !== "daily" && parsed.freq !== "weekly") ||
      !parsed.anchorSleepStartIso
    ) {
      return null;
    }
    return {
      v: 1,
      seriesId: parsed.seriesId,
      freq: parsed.freq,
      anchorSleepStartIso: parsed.anchorSleepStartIso,
    };
  } catch {
    return null;
  }
}

export function buildSleepRecurrenceNotes(meta: SleepRecurrenceMeta): string {
  return `${RECURRENCE_PREFIX}${JSON.stringify(meta)}`;
}
