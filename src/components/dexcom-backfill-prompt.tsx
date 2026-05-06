"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { DAY_DATA_CHANGED_EVENT } from "@/lib/day-view-events";

type Props = {
  /** Share / pydexcom server path — 90-day backfill is limited vs OAuth. */
  shareCredentialsMode: boolean;
  className?: string;
};

export function DexcomBackfillPrompt({ shareCredentialsMode, className }: Props) {
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

  return (
    <aside
      className={`rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50/95 to-amber-100/40 p-4 ring-1 ring-amber-200/50 ${className ?? ""}`}
      role="region"
      aria-label="Dexcom historical import"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-amber-950">Import your last 90 days of Dexcom data?</p>
          <p className="text-xs leading-relaxed text-amber-950/85">
            Run a one-time sync to backfill glucose in Align. Regular “Sync” afterward only pulls recent
            readings.
            {shareCredentialsMode ? (
              <>
                {" "}
                <span className="font-medium">
                  Note: Dexcom Share mode only receives roughly the last 24 hours per sync (Dexcom limit).
                  Connect with Dexcom OAuth for a full 90-day import when available.
                </span>
              </>
            ) : null}
          </p>
          {error ? (
            <p className="text-xs font-medium text-red-800" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-950 disabled:opacity-50"
              onClick={() => void syncNinetyDays()}
            >
              {busy ? "Syncing…" : "Import 90 days"}
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg border border-amber-300/90 bg-white/90 px-3 py-1.5 text-xs font-medium text-amber-950 transition hover:bg-white disabled:opacity-50"
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
