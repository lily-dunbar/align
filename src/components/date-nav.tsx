"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useEffectiveTimeZone } from "@/hooks/use-effective-timezone";
import { OPEN_MANUAL_MODAL_EVENT } from "@/lib/day-view-events";
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
  return dt.toLocaleDateString();
}

export function DateNav({ initialDateYmd }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const effectiveTz = useEffectiveTimeZone();
  const selectedDate = useResolvedDayYmd(initialDateYmd);
  const todayYmd = getLocalCalendarYmd(new Date(), effectiveTz);
  const isAtLatestDay = selectedDate >= todayYmd;
  const dateLabel = formatDateLabel(selectedDate, todayYmd);

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
      <div className="py-0.5">
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex w-full justify-center sm:flex-1 sm:justify-start">
            <div className="grid min-w-0 w-full max-w-md grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5">
              <button
                type="button"
                className="touch-manipulation flex min-h-12 min-w-[2.75rem] shrink-0 items-center justify-center rounded-full border border-transparent px-2.5 py-2 text-sm text-zinc-700 transition hover:bg-align-subtle active:bg-align-subtle sm:px-3"
                onClick={() => setDate(addDays(selectedDate, -1))}
              >
                ← Prev
              </button>
              {/* Overlay native date input so taps open the picker on mobile (showPicker is flaky). */}
              <div className="relative isolate flex min-h-12 min-w-0 w-full touch-manipulation items-center justify-center rounded-xl border border-align-border bg-white px-3 py-2.5 text-center text-sm text-zinc-800 shadow-sm shadow-black/5">
                <input
                  type="date"
                  value={selectedDate}
                  max={todayYmd}
                  onChange={(e) => setDate(e.target.value)}
                  className="absolute inset-0 z-[1] h-full min-h-12 w-full cursor-pointer opacity-0 [color-scheme:light]"
                  aria-label="Choose date"
                  style={{ fontSize: "max(16px, 1rem)" }}
                />
                <span className="pointer-events-none relative z-0 block max-w-full truncate font-medium">
                  {dateLabel}
                </span>
              </div>
              <button
                type="button"
                disabled={isAtLatestDay}
                aria-disabled={isAtLatestDay}
                title={isAtLatestDay ? "Already on the latest day you can view" : undefined}
                className="touch-manipulation flex min-h-12 min-w-[2.75rem] shrink-0 items-center justify-center rounded-full border border-transparent px-2.5 py-2 text-sm text-zinc-700 transition hover:bg-align-subtle active:bg-align-subtle disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent sm:px-3"
                onClick={() => setDate(addDays(selectedDate, 1))}
              >
                Next →
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={openAddActivityModal}
            className="inline-flex min-h-10 w-full shrink-0 items-center justify-center gap-1.5 rounded-full bg-align-forest px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-black/10 transition hover:bg-align-forest-muted sm:w-auto"
          >
            <span aria-hidden>+</span>
            <span>Add Activity</span>
          </button>
        </div>
      </div>
    </section>
  );
}
