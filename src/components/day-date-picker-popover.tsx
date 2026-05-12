"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { uiPanelSurface } from "@/lib/ui-surfaces";

type Props = {
  id: string;
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  /** YYYY-MM-DD */
  selectedYmd: string;
  /** YYYY-MM-DD — no day after this is selectable */
  maxYmd: string;
  onSelectYmd: (ymd: string) => void;
};

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m: m || 1, d: d || 1 };
}

function toYmd(y: number, m1: number, d: number) {
  return `${y}-${String(m1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function monthKey(y: number, monthIndex0: number) {
  return y * 12 + monthIndex0;
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {dir === "left" ? <path d="M15 6l-6 6 6 6" /> : <path d="M9 6l6 6-6 6" />}
    </svg>
  );
}

/** Month grid: 0 = Sunday … 6 = Saturday (matches `Date#getDay`). */
function buildMonthCells(year: number, monthIndex: number): (number | null)[] {
  const firstDow = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  while (cells.length < 42) cells.push(null);
  return cells;
}

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

export function DayDatePickerPopover({
  id,
  open,
  onClose,
  anchorRef,
  selectedYmd,
  maxYmd,
  onSelectYmd,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const maxParsed = useMemo(() => parseYmd(maxYmd), [maxYmd]);
  const [viewYear, setViewYear] = useState(() => parseYmd(selectedYmd).y);
  const [viewMonthIndex, setViewMonthIndex] = useState(() => parseYmd(selectedYmd).m - 1);

  useEffect(() => {
    if (!open) return;
    const { y, m } = parseYmd(selectedYmd);
    setViewYear(y);
    setViewMonthIndex(m - 1);
  }, [open, selectedYmd]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) onClose();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    function updatePosition() {
      const anchor = anchorRef.current;
      const pop = rootRef.current;
      if (!anchor || !pop) return;
      const ar = anchor.getBoundingClientRect();
      const vw = window.innerWidth;
      const popW = pop.offsetWidth || 320;
      const margin = 12;
      const centeredLeft = ar.left + ar.width / 2 - popW / 2;
      const clampedLeft = Math.max(margin, Math.min(vw - popW - margin, centeredLeft));
      const top = ar.bottom + 8;
      setPosition({ top, left: clampedLeft });
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const cells = useMemo(
    () => buildMonthCells(viewYear, viewMonthIndex),
    [viewYear, viewMonthIndex],
  );

  const monthTitle = useMemo(
    () =>
      new Date(viewYear, viewMonthIndex, 1).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      }),
    [viewYear, viewMonthIndex],
  );

  const maxMonthKey = monthKey(maxParsed.y, maxParsed.m - 1);
  const viewMonthKey = monthKey(viewYear, viewMonthIndex);
  const canGoNext = viewMonthKey < maxMonthKey;

  const goPrevMonth = useCallback(() => {
    setViewMonthIndex((m) => {
      if (m <= 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }, []);

  const goNextMonth = useCallback(() => {
    if (monthKey(viewYear, viewMonthIndex) >= maxMonthKey) return;
    if (viewMonthIndex >= 11) {
      setViewYear((y) => y + 1);
      setViewMonthIndex(0);
    } else {
      setViewMonthIndex((m) => m + 1);
    }
  }, [maxMonthKey, viewMonthIndex, viewYear]);

  if (!open) return null;

  return (
    <div
      ref={rootRef}
      id={id}
      role="dialog"
      aria-modal="true"
      aria-label="Choose calendar day"
      style={{ top: position.top, left: position.left }}
      className={`fixed z-50 w-[min(100vw-1.5rem,20rem)] p-4 ${uiPanelSurface} shadow-lg shadow-black/[0.08] ring-1 ring-align-forest/12`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-align-border-soft pb-3">
        <button
          type="button"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-align-border/80 bg-white text-align-forest transition hover:bg-align-nav-active"
          aria-label="Previous month"
          onClick={goPrevMonth}
        >
          <Chevron dir="left" />
        </button>
        <p className="min-w-0 flex-1 text-center text-sm font-semibold text-align-forest">{monthTitle}</p>
        <button
          type="button"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-align-border/80 bg-white text-align-forest transition hover:bg-align-nav-active disabled:cursor-not-allowed disabled:opacity-35"
          aria-label="Next month"
          disabled={!canGoNext}
          onClick={goNextMonth}
        >
          <Chevron dir="right" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-y-1 text-center text-[10px] font-semibold uppercase tracking-wide text-align-muted">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, idx) => {
          if (day == null) {
            return <div key={`e-${idx}`} className="aspect-square min-h-[2.25rem]" />;
          }
          const ymd = toYmd(viewYear, viewMonthIndex + 1, day);
          const isSelected = ymd === selectedYmd;
          const isFuture = ymd > maxYmd;
          const isToday = ymd === maxYmd;

          return (
            <button
              key={ymd}
              type="button"
              disabled={isFuture}
              onClick={() => {
                if (!isFuture) {
                  onSelectYmd(ymd);
                  onClose();
                }
              }}
              className={[
                "flex aspect-square min-h-[2.25rem] items-center justify-center rounded-lg text-sm font-medium tabular-nums transition outline-none focus-visible:ring-2 focus-visible:ring-align-forest/35 focus-visible:ring-offset-2",
                isFuture
                  ? "cursor-not-allowed text-zinc-300"
                  : isSelected
                    ? "bg-align-forest text-white shadow-sm shadow-black/15"
                    : isToday
                      ? "ring-1 ring-align-forest/45 text-align-forest hover:bg-align-nav-active"
                      : "text-zinc-800 hover:bg-align-subtle/90 hover:text-align-forest",
              ].join(" ")}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}