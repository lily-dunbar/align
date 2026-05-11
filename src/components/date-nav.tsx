"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { DayDatePickerPopover } from "@/components/day-date-picker-popover";
import { useEffectiveTimeZone } from "@/hooks/use-effective-timezone";
import { OPEN_DAY_DATE_PICKER_EVENT, OPEN_MANUAL_MODAL_EVENT } from "@/lib/day-view-events";
import { getLocalCalendarYmd } from "@/lib/local-calendar-ymd";
import { useResolvedDayYmd } from "@/lib/use-resolved-day-ymd";

type Props = {
  initialDateYmd: string;
};

/** Move by calendar days using JS local date arithmetic (chosen calendar day strings). */
function addDays(dateYmd: string, delta: number) {
  const [y, m, d] = dateYmd.split("-").map(Number);
  const base = new Date(y, m - 1, d + delta);
  const yy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function formatDateLabel(dateYmd: string, todayYmd: string) {
  if (dateYmd === todayYmd) return "Today";
  const [y, m, d] = dateYmd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return dateYmd;
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function CalendarGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3.25" y="5.25" width="17.5" height="15.5" rx="2" />
      <path d="M8 3.25v4M16 3.25v4M3.25 10.25h17.5" />
    </svg>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

const navCircleBtnClass =
  "inline-flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full border border-zinc-200/95 bg-white text-zinc-700 shadow-sm shadow-black/[0.04] outline-none transition hover:border-zinc-300 hover:bg-zinc-50/90 active:scale-[0.97] motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-align-forest/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:border-zinc-100 disabled:bg-zinc-50 disabled:text-zinc-300 disabled:shadow-none disabled:hover:bg-zinc-50";

export function DateNav({ initialDateYmd }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const effectiveTz = useEffectiveTimeZone();
  const pickerPanelId = useId();
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectedDate = useResolvedDayYmd(initialDateYmd);
  const todayYmd = getLocalCalendarYmd(new Date(), effectiveTz);
  const isAtLatestDay = selectedDate >= todayYmd;
  const dateLabel = formatDateLabel(selectedDate, todayYmd);

  const openPicker = useCallback(() => {
    setPickerOpen(true);
  }, []);

  useEffect(() => {
    function onOpenDatePickerRequest() {
      queueMicrotask(() => {
        setPickerOpen(true);
      });
    }
    window.addEventListener(OPEN_DAY_DATE_PICKER_EVENT, onOpenDatePickerRequest);
    return () => {
      window.removeEventListener(OPEN_DAY_DATE_PICKER_EVENT, onOpenDatePickerRequest);
    };
  }, []);

  useEffect(() => {
    if (selectedDate > todayYmd) {
      const qp = new URLSearchParams(params.toString());
      qp.set("date", todayYmd);
      router.replace(`${pathname}?${qp.toString()}`);
    }
  }, [selectedDate, todayYmd, pathname, params, router]);

  function setDate(nextDate: string) {
    const capped = nextDate > todayYmd ? todayYmd : nextDate;
    const qp = new URLSearchParams(params.toString());
    qp.set("date", capped);
    router.push(`${pathname}?${qp.toString()}`);
  }

  function openAddActivityModal() {
    window.dispatchEvent(new CustomEvent(OPEN_MANUAL_MODAL_EVENT, { detail: { tab: "activity" } }));
  }

  return (
    <section className="w-full" aria-label="Day navigation">
      <div className="flex flex-col gap-3">
        <div className="flex w-full items-center gap-2 sm:gap-3">
          <button
            type="button"
            aria-label="Previous day"
            className={navCircleBtnClass}
            onClick={() => setDate(addDays(selectedDate, -1))}
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>

          <div className="relative flex min-h-10 min-w-0 flex-1 justify-center touch-manipulation">
            <button
              type="button"
              onClick={() => openPicker()}
              className="inline-flex min-h-10 min-w-0 max-w-full cursor-pointer select-none items-center justify-center gap-2 rounded-full px-3 py-2 text-center transition hover:bg-align-subtle/90 active:bg-align-subtle"
              aria-expanded={pickerOpen}
              aria-haspopup="dialog"
              aria-controls={pickerPanelId}
              aria-label={`Choose date, ${dateLabel}`}
            >
              <CalendarGlyph className="h-4 w-4 shrink-0 text-align-forest/80" aria-hidden />
              <span className="truncate text-sm font-semibold tracking-tight text-zinc-800">
                {dateLabel}
              </span>
            </button>
            <DayDatePickerPopover
              id={pickerPanelId}
              open={pickerOpen}
              onClose={() => setPickerOpen(false)}
              selectedYmd={selectedDate}
              maxYmd={todayYmd}
              onSelectYmd={setDate}
            />
          </div>

          <button
            type="button"
            aria-label="Next day"
            disabled={isAtLatestDay}
            aria-disabled={isAtLatestDay}
            title={isAtLatestDay ? "Already on the latest day you can view" : undefined}
            className={navCircleBtnClass}
            onClick={() => setDate(addDays(selectedDate, 1))}
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex justify-stretch sm:justify-end">
          <button
            type="button"
            onClick={openAddActivityModal}
            className="inline-flex min-h-11 w-full min-w-0 items-center justify-center gap-1.5 rounded-full bg-align-forest px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-black/10 outline-none transition hover:bg-align-forest-muted active:brightness-95 focus-visible:ring-2 focus-visible:ring-align-forest/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto sm:min-w-[10.5rem]"
          >
            <span aria-hidden>+</span>
            <span>Add Activity</span>
          </button>
        </div>
      </div>
    </section>
  );
}
