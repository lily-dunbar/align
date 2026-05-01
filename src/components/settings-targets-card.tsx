"use client";

import { useEffect, useState } from "react";

import type { UserPreferences } from "@/lib/user-display-preferences";
import {
  GLUCOSE_HIGH_MAX,
  GLUCOSE_HIGH_MIN,
  GLUCOSE_LOW_MAX,
  GLUCOSE_LOW_MIN,
  TARGET_STEPS_MAX,
  TARGET_STEPS_MIN,
  TARGET_TIR_MAX,
  TARGET_TIR_MIN,
} from "@/lib/user-target-constants";

export function SettingsTargetsCard() {
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const resp = await fetch("/api/settings/preferences", { cache: "no-store" });
        const json = (await resp.json()) as {
          preferences?: UserPreferences;
          error?: string;
        };
        if (!resp.ok || !json.preferences) {
          throw new Error(json.error ?? "Failed to load preferences");
        }
        if (!cancelled) setPrefs(json.preferences);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveTargets() {
    if (!prefs) return;
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch("/api/settings/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetLowMgdl: prefs.targetLowMgdl,
          targetHighMgdl: prefs.targetHighMgdl,
          targetTirPercent: prefs.targetTirPercent,
          targetStepsPerDay: prefs.targetStepsPerDay,
        }),
      });
      const json = (await resp.json()) as {
        preferences?: UserPreferences;
        error?: string;
      };
      if (!resp.ok || !json.preferences) {
        throw new Error(json.error ?? "Failed to save targets");
      }
      setPrefs(json.preferences);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    setPrefs((p) => (p ? { ...p, [key]: value } : p));
  }

  return (
    <section className="w-full rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="border-b border-zinc-100 pb-4">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Targets</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Glucose target band and goals used on the home chart and summaries.
        </p>
      </div>

      {loading ? <p className="mt-4 text-sm text-zinc-500">Loading targets…</p> : null}
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      {prefs ? (
        <div className="mt-5 space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Target range
              </h3>
              <p className="mt-1 text-sm text-zinc-600">
                Low and high bounds (mg/dL) for time-in-range and reference lines on the daily chart.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-end justify-end gap-4 sm:gap-5">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-zinc-600">Low</span>
                <input
                  type="number"
                  className="w-28 rounded-lg border border-zinc-300 px-3 py-2"
                  min={GLUCOSE_LOW_MIN}
                  max={GLUCOSE_LOW_MAX}
                  value={prefs.targetLowMgdl}
                  onChange={(e) => update("targetLowMgdl", Number(e.target.value))}
                  disabled={saving}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-zinc-600">High</span>
                <input
                  type="number"
                  className="w-28 rounded-lg border border-zinc-300 px-3 py-2"
                  min={GLUCOSE_HIGH_MIN}
                  max={GLUCOSE_HIGH_MAX}
                  value={prefs.targetHighMgdl}
                  onChange={(e) => update("targetHighMgdl", Number(e.target.value))}
                  disabled={saving}
                />
              </label>
            </div>
          </div>

          <div className="space-y-5 border-t border-zinc-100 pt-5">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Target TIR
              </h3>
              <p className="mt-1 text-sm text-zinc-600">
                Goal percent in range ({TARGET_TIR_MIN}–{TARGET_TIR_MAX}%). Used for summary
                comparison.
              </p>
              <input
                type="number"
                className="mt-3 w-full max-w-[12rem] rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                min={TARGET_TIR_MIN}
                max={TARGET_TIR_MAX}
                value={prefs.targetTirPercent}
                onChange={(e) => update("targetTirPercent", Number(e.target.value))}
                disabled={saving}
              />
              <span className="ml-2 text-sm text-zinc-500">%</span>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Steps / day
              </h3>
              <p className="mt-1 text-sm text-zinc-600">
                Daily step goal ({TARGET_STEPS_MIN.toLocaleString()}–
                {TARGET_STEPS_MAX.toLocaleString()}).
              </p>
              <input
                type="number"
                className="mt-3 w-full max-w-[12rem] rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                min={TARGET_STEPS_MIN}
                max={TARGET_STEPS_MAX}
                step={500}
                value={prefs.targetStepsPerDay}
                onChange={(e) => update("targetStepsPerDay", Number(e.target.value))}
                disabled={saving}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-5">
            <button
              type="button"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
              disabled={saving}
              onClick={() => void saveTargets()}
            >
              {saving ? "Saving…" : "Save targets"}
            </button>
            {savedFlash ? (
              <span className="text-sm text-emerald-700" aria-live="polite">
                Saved
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
