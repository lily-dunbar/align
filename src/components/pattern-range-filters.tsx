import Link from "next/link";

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

  return (
    <div
      className="flex flex-wrap gap-2"
      role="tablist"
      aria-label="Pattern date range"
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
            className={
              selected
                ? "rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm"
                : "rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
            }
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
