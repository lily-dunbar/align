"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { OPEN_MANUAL_MODAL_EVENT } from "@/lib/day-view-events";
import { useEffectiveTimeZone } from "@/hooks/use-effective-timezone";
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

export function DateNav({ initialDateYmd }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const effectiveTz = useEffectiveTimeZone();
  const selectedDate = useResolvedDayYmd(initialDateYmd);
  const todayYmd = getLocalCalendarYmd(new Date(), effectiveTz);
  const isAtLatestDay = selectedDate >= todayYmd;

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

  return (
    <section className="w-full" aria-label="Day navigation">
      <div className="flex flex-col gap-3 py-0.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-full border border-transparent px-3 py-2 text-sm text-zinc-700 transition hover:bg-align-subtle"
            onClick={() => setDate(addDays(selectedDate, -1))}
          >
            ← Prev
          </button>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input
              type="date"
              value={selectedDate}
              max={todayYmd}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl border border-align-border bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm shadow-black/5"
            />
          </label>
          <button
            type="button"
            disabled={isAtLatestDay}
            aria-disabled={isAtLatestDay}
            title={isAtLatestDay ? "Already on the latest day you can view" : undefined}
            className="rounded-full border border-transparent px-3 py-2 text-sm text-zinc-700 transition hover:bg-align-subtle disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            onClick={() => setDate(addDays(selectedDate, 1))}
          >
            Next →
          </button>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-full bg-align-forest px-5 py-2.5 text-sm font-medium text-white shadow-[0_4px_20px_-4px_rgba(27,77,67,0.35)] transition hover:bg-align-forest-muted"
          onClick={() => {
            window.dispatchEvent(new CustomEvent(OPEN_MANUAL_MODAL_EVENT));
          }}
        >
          Add / edit activity
        </button>
      </div>
    </section>
  );
}
