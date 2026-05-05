"use client";

import Link from "next/link";
import { useEffect } from "react";

import {
  PATTERNS_WINDOW_CHANGED_EVENT,
  PATTERNS_WINDOW_STORAGE_KEY,
} from "@/lib/patterns/stored-window";
import type { PatternWindow } from "@/lib/patterns/types";

const WINDOWS: { id: PatternWindow; label: string }[] = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
];

export function PatternRangeFilters({
  active,
  timeZone,
}: {
  active: PatternWindow;
  timeZone: string;
}) {
  const href = (w: PatternWindow) =>
    `/patterns?window=${w}&timeZone=${encodeURIComponent(timeZone)}`;

  function persistWindow(w: PatternWindow) {
    try {
      sessionStorage.setItem(PATTERNS_WINDOW_STORAGE_KEY, w);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(PATTERNS_WINDOW_CHANGED_EVENT));
      }
    } catch {
      /* private mode / quota */
    }
  }

  useEffect(() => {
    persistWindow(active);
  }, [active]);

  return (
    <div
      className="flex flex-wrap gap-2"
      role="tablist"
      aria-label="Insights date range"
    >
      {WINDOWS.map(({ id, label }) => {
        const selected = id === active;
        return (
          <Link
            key={id}
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            href={href(id)}
            onClick={() => persistWindow(id)}
            className={
              selected
                ? "rounded-full bg-align-forest px-4 py-2 text-sm font-medium text-white shadow-sm shadow-black/10"
                : "rounded-full border border-align-border/90 bg-white/90 px-4 py-2 text-sm font-medium text-zinc-700 ring-1 ring-black/[0.03] transition hover:bg-align-subtle"
            }
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
