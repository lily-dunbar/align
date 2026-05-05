/** Subset of GET /api/day/insights JSON we persist for instant replay. */
export type DayInsightsCacheablePayload = {
  ok?: boolean;
  source?: "anthropic" | "spark" | "demo";
  insights?: { title: string; detail: string }[];
  message?: string;
  generatedAt?: string;
  date?: string;
  timeZone?: string;
};

export type DayInsightsCached = {
  digest: string;
  payload: DayInsightsCacheablePayload;
};

export function dayInsightsSessionKey(
  userId: string | null | undefined,
  dateYmd: string,
  timeZone: string,
): string | null {
  if (!userId) return null;
  return `align.dayInsights.v1:${userId}:${dateYmd}:${timeZone}`;
}

export function readDayInsightsSessionCache(storageKey: string | null): DayInsightsCached | null {
  if (!storageKey || typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DayInsightsCached;
    if (
      typeof parsed?.digest !== "string" ||
      typeof parsed?.payload !== "object" ||
      parsed.payload == null
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeDayInsightsSessionCache(
  storageKey: string | null,
  cached: DayInsightsCached,
): void {
  if (!storageKey || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(cached));
  } catch {
    /* quota / privacy mode — ignore */
  }
}

export function clearDayInsightsSessionCache(storageKey: string | null): void {
  if (!storageKey || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    /* ignore */
  }
}
