"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { DAY_DATA_CHANGED_EVENT } from "@/lib/day-view-events";

type Props = {
  className?: string;
};

export function DexcomBackfillPrompt({ className }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function dismissPrompt() {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/settings/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dexcomBackfill90PromptDismissed: true }),
      });
      const json = (await resp.json()) as { error?: string };
      if (!resp.ok) throw new Error(json.error ?? "Could not update preference");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not dismiss");
    } finally {
      setBusy(false);
    }
  }

  async function syncNinetyDays() {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/integrations/dexcom/sync?format=json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lookbackDays: 90,
          dismissDexcomBackfillPrompt: true,
        }),
      });
      const json = (await resp.json()) as {
        error?: string;
        fetched?: number;
        inserted?: number;
        updated?: number;
        unchanged?: number;
      };
      if (!resp.ok) throw new Error(json.error ?? "Dexcom sync failed");
      window.dispatchEvent(new Event(DAY_DATA_CHANGED_EVENT));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  const cardShell =
    "w-full rounded-2xl border border-white/70 bg-[linear-gradient(135deg,rgba(221,234,229,0.78)_0%,rgba(212,227,246,0.8)_52%,rgba(243,245,235,0.78)_100%)] px-4 py-3 shadow-[0_8px_18px_-16px_rgba(35,84,92,0.3)] ring-1 ring-black/[0.025]";

  return (
    <aside
      className={`${cardShell} ${className ?? ""}`}
      role="region"
      aria-label="Dexcom historical import"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-zinc-900">
            Import your last 90 days of Dexcom data?
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-600">
            Run a one-time sync to backfill glucose in Align. Regular “Sync” afterward only pulls recent
            readings.{" "}
            <span className="font-medium text-zinc-700">
              Note: Dexcom Share mode only receives roughly the last 24 hours per sync (Dexcom limit).
              Connect with Dexcom OAuth for a full 90-day import when available.
            </span>
          </p>
          {error ? (
            <p className="mt-2 text-xs font-medium text-red-800" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <button
              type="button"
              disabled={busy}
              className="rounded-full bg-[#0f6e68] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0c615c] disabled:opacity-50"
              onClick={() => void syncNinetyDays()}
            >
              {busy ? "Syncing…" : "Import 90 days"}
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-full border border-zinc-300/75 bg-white/75 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-white disabled:opacity-50"
              onClick={() => void dismissPrompt()}
            >
              Don&apos;t show again
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
