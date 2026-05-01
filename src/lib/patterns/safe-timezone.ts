import { formatYmdInZone } from "@/lib/patterns/format-ymd";

/** Fallback to UTC if the name is not usable with Intl (bad query param). */
export function safeTimeZoneForPatterns(name: string | undefined): string {
  const tz = name?.trim();
  if (!tz) return "UTC";
  try {
    formatYmdInZone(new Date(), tz);
    return tz;
  } catch {
    return "UTC";
  }
}
