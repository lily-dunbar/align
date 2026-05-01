"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { OPEN_MANUAL_MODAL_EVENT } from "@/lib/day-view-events";

type Props = {
  initialDateYmd: string;
};

function addDays(dateYmd: string, delta: number) {
  const d = new Date(`${dateYmd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function DateNav({ initialDateYmd }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedDate = params.get("date") ?? initialDateYmd;

  function setDate(nextDate: string) {
    const qp = new URLSearchParams(params.toString());
    qp.set("date", nextDate);
    router.push(`${pathname}?${qp.toString()}`);
  }

  return (
    <section className="w-full rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm transition hover:bg-zinc-50"
            onClick={() => setDate(addDays(selectedDate, -1))}
          >
            ← Prev
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-zinc-300 px-2 py-1"
            />
          </label>
          <button
            type="button"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm transition hover:bg-zinc-50"
            onClick={() => setDate(addDays(selectedDate, 1))}
          >
            Next →
          </button>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
          onClick={() => {
            window.dispatchEvent(new CustomEvent(OPEN_MANUAL_MODAL_EVENT));
          }}
        >
          Add activity
        </button>
      </div>
    </section>
  );
}
