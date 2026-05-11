"use client";

import Link from "next/link";
import { useEffect } from "react";

import {
  PATTERNS_WINDOW_CHANGED_EVENT,
  PATTERNS_WINDOW_STORAGE_KEY,
} from "@/lib/patterns/stored-window";
import type { PatternWindow } from "@/lib/patterns/types";

const WINDOWS: { id: PatternWindow; label: string; title: string }[] = [
  { id: "7d", label: "7d", title: "7 days" },
  { id: "30d", label: "30d", title: "30 days" },
  { id: "90d", label: "90d", title: "90 days" },
];

export function PatternRangeFilters({
  active,
  timeZone,
  onWindowChange,
  navigationPending = false,
}: {
  active: PatternWindow;
  timeZone: string;
  /** Client navigation (e.g. `useTransition` + `router.push`) so parents can show loading UI. */
  onWindowChange?: (w: PatternWindow) => void;
  /** Disables range controls while a client navigation is in flight. */
  navigationPending?: boolean;
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

  const tabClass = (selected: boolean) =>
    selected
      ? "flex min-h-10 flex-1 basis-0 items-center justify-center rounded-full bg-align-forest px-2 py-2 text-sm font-semibold text-white shadow-sm shadow-black/10 sm:px-3"
      : "flex min-h-10 flex-1 basis-0 items-center justify-center rounded-full px-2 py-2 text-sm font-semibold text-align-forest transition hover:bg-white/70 sm:px-3";

  return (
    <div
      className="flex w-full min-w-0 rounded-full bg-align-subtle/95 p-1 ring-1 ring-align-border/45"
      role="tablist"
      aria-label="Insights date range"
      aria-busy={navigationPending}
    >
      {WINDOWS.map(({ id, label, title }) => {
        const selected = id === active;
        if (onWindowChange) {
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              disabled={navigationPending}
              onClick={() => {
                persistWindow(id);
                onWindowChange(id);
              }}
              aria-label={title}
              title={title}
              className={`${tabClass(selected)} ${navigationPending ? "cursor-wait opacity-80" : ""}`}
            >
              {label}
            </button>
          );
        }
        return (
          <Link
            key={id}
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            href={href(id)}
            aria-label={title}
            title={title}
            onClick={() => persistWindow(id)}
            className={tabClass(selected)}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
