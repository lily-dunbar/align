"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import type { PatternWindow } from "@/lib/patterns/types";

/** Adds browser `timeZone` to the URL once when missing so server stats bucket by local days. */
export function PatternsTimezoneSync({ window }: { window: PatternWindow }) {
  const router = useRouter();

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    router.replace(`/patterns?window=${window}&timeZone=${encodeURIComponent(tz)}`);
  }, [router, window]);

  return null;
}
