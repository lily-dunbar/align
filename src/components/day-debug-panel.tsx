"use client";

import { useEffect, useState } from "react";

type DayPayload = {
  day: {
    date: string | null;
    timeZone: string;
  };
  aggregates: Record<string, unknown>;
};

type Props = {
  dateYmd: string;
};

export function DayDebugPanel({ dateYmd }: Props) {
  const [data, setData] = useState<DayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
        const resp = await fetch(
          `/api/day?date=${encodeURIComponent(dateYmd)}&timeZone=${encodeURIComponent(tz)}`,
          { cache: "no-store" },
        );
        const json = (await resp.json()) as DayPayload & { error?: string };
        if (!resp.ok) {
          throw new Error(json.error ?? "Failed to load day data");
        }
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [dateYmd]);

  return (
    <section className="w-full rounded-lg border p-4 text-left">
      <h2 className="text-lg font-medium">Day debug</h2>
      {loading ? <p className="mt-2 text-sm text-zinc-600">Loading…</p> : null}
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      {data ? (
        <pre className="mt-3 overflow-x-auto rounded bg-zinc-50 p-3 text-xs">
          {JSON.stringify(
            {
              day: data.day,
              aggregates: data.aggregates,
            },
            null,
            2,
          )}
        </pre>
      ) : null}
    </section>
  );
}
