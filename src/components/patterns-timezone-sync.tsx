"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import {
  PATTERNS_WINDOW_CHANGED_EVENT,
  PATTERNS_WINDOW_STORAGE_KEY,
} from "@/lib/patterns/stored-window";
import type { PatternWindow } from "@/lib/patterns/types";

/** Adds browser `timeZone` to the URL once when missing so server stats bucket by local days. */
export function PatternsTimezoneSync({ window: patternWindow }: { window: PatternWindow }) {
  const router = useRouter();

  useEffect(() => {
    try {
      sessionStorage.setItem(PATTERNS_WINDOW_STORAGE_KEY, patternWindow);
      globalThis.window?.dispatchEvent(new Event(PATTERNS_WINDOW_CHANGED_EVENT));
    } catch {
      /* private mode */
    }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    router.replace(
      `/patterns?window=${patternWindow}&timeZone=${encodeURIComponent(tz)}`,
    );
  }, [router, patternWindow]);

  return null;
}
