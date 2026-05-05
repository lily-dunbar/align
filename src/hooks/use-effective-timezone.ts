"use client";

import { useEffect, useState } from "react";

import { formatYmdInZone } from "@/lib/patterns/format-ymd";

/**
 * Preference IANA zone when set in Settings; otherwise the browser zone.
 * Used for `/api/day` and `/api/day/insights` query params so calendar days match user intent.
 */
export function useEffectiveTimeZone(): string {
  const [tz, setTz] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
  );

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const resp = await fetch("/api/settings/preferences", { cache: "no-store" });
        if (!resp.ok) return;
        const json = (await resp.json()) as {
          preferences?: { ianaTimeZone?: string | null };
        };
        const saved = json.preferences?.ianaTimeZone?.trim();
        if (cancelled || !saved) return;
        try {
          formatYmdInZone(new Date(), saved);
          setTz(saved);
        } catch {
          /* ignore invalid stored value */
        }
      } catch {
        /* keep browser zone */
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return tz;
}
