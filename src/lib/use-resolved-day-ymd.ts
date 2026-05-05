"use client";

import { startTransition, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useEffectiveTimeZone } from "@/hooks/use-effective-timezone";
import { getLocalCalendarYmd } from "@/lib/local-calendar-ymd";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `?date=YYYY-MM-DD` when present; otherwise the calendar day from Settings → time zone
 * (when set), else this device’s zone.
 */
export function useResolvedDayYmd(initialYmd: string): string {
  const searchParams = useSearchParams();
  const effectiveTz = useEffectiveTimeZone();
  const q = searchParams.get("date");
  const [localDefault, setLocalDefault] = useState<string | null>(null);

  useEffect(() => {
    startTransition(() => {
      setLocalDefault(getLocalCalendarYmd(new Date(), effectiveTz));
    });
  }, [effectiveTz]);

  if (q && YMD.test(q)) return q;
  return localDefault ?? initialYmd;
}
