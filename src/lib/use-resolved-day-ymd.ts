"use client";

import { startTransition, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { getLocalCalendarYmd } from "@/lib/local-calendar-ymd";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `?date=YYYY-MM-DD` when present; otherwise the user's **local** calendar day (not UTC).
 * `initialYmd` is only used before mount / when the URL has no date (SSR first paint).
 */
export function useResolvedDayYmd(initialYmd: string): string {
  const searchParams = useSearchParams();
  const q = searchParams.get("date");
  const [localDefault, setLocalDefault] = useState<string | null>(null);

  useEffect(() => {
    startTransition(() => {
      setLocalDefault(getLocalCalendarYmd());
    });
  }, []);

  if (q && YMD.test(q)) return q;
  return localDefault ?? initialYmd;
}
