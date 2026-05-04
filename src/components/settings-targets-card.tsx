"use client";

import { useEffect, useState } from "react";

import { Skeleton } from "@/components/skeleton";
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

type TargetFields = Pick<
  UserPreferences,
  "targetLowMgdl" | "targetHighMgdl" | "targetTirPercent" | "targetStepsPerDay"
>;

function pickTargets(p: UserPreferences): TargetFields {
  return {
    targetLowMgdl: p.targetLowMgdl,
    targetHighMgdl: p.targetHighMgdl,
    targetTirPercent: p.targetTirPercent,
    targetStepsPerDay: p.targetStepsPerDay,
  };
}

function targetsMatch(a: TargetFields, b: TargetFields): boolean {
  return (
    a.targetLowMgdl === b.targetLowMgdl &&
    a.targetHighMgdl === b.targetHighMgdl &&
    a.targetTirPercent === b.targetTirPercent &&
    a.targetStepsPerDay === b.targetStepsPerDay
  );
}

export function SettingsTargetsCard() {
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [savedTargets, setSavedTargets] = useState<TargetFields | null>(null);
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
        if (!cancelled) {
          setPrefs(json.preferences);
          setSavedTargets(pickTargets(json.preferences));
        }
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
      setSavedTargets(pickTargets(json.preferences));
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

  const targetsDirty =
    prefs != null && savedTargets != null && !targetsMatch(pickTargets(prefs), savedTargets);

  return (
    <section className="w-full rounded-2xl border border-align-border/90 bg-white/90 p-5 ring-1 ring-black/[0.03]">
      <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Targets</h2>

      {loading ? (
        <div className="mt-5 space-y-4" aria-busy="true" aria-label="Loading targets">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 pb-4"
            >
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-28 rounded-lg" />
            </div>
          ))}
        </div>
      ) : null}
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      {prefs ? (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 pb-4">
            <span className="text-sm text-zinc-800">Low (mg/dL)</span>
            <input
              type="number"
              className="w-28 rounded-lg border border-zinc-300 px-3 py-2 text-right text-sm tabular-nums"
              min={GLUCOSE_LOW_MIN}
              max={GLUCOSE_LOW_MAX}
              value={prefs.targetLowMgdl}
              onChange={(e) => update("targetLowMgdl", Number(e.target.value))}
              disabled={saving}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 pb-4">
            <span className="text-sm text-zinc-800">High (mg/dL)</span>
            <input
              type="number"
              className="w-28 rounded-lg border border-zinc-300 px-3 py-2 text-right text-sm tabular-nums"
              min={GLUCOSE_HIGH_MIN}
              max={GLUCOSE_HIGH_MAX}
              value={prefs.targetHighMgdl}
              onChange={(e) => update("targetHighMgdl", Number(e.target.value))}
              disabled={saving}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 pb-4">
            <span className="text-sm text-zinc-800">
              Target TIR ({TARGET_TIR_MIN}–{TARGET_TIR_MAX}%)
            </span>
            <div className="relative w-28">
              <input
                type="number"
                className="w-full rounded-lg border border-zinc-300 py-2 pr-8 pl-3 text-right text-sm tabular-nums"
                min={TARGET_TIR_MIN}
                max={TARGET_TIR_MAX}
                value={prefs.targetTirPercent}
                onChange={(e) => update("targetTirPercent", Number(e.target.value))}
                disabled={saving}
                aria-label="Target time in range percent"
              />
              <span
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500"
                aria-hidden
              >
                %
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 pb-4">
            <span className="text-sm text-zinc-800">
              Steps / day ({TARGET_STEPS_MIN.toLocaleString()}–{TARGET_STEPS_MAX.toLocaleString()})
            </span>
            <input
              type="number"
              className="w-28 rounded-lg border border-zinc-300 px-3 py-2 text-right text-sm tabular-nums"
              min={TARGET_STEPS_MIN}
              max={TARGET_STEPS_MAX}
              step={500}
              value={prefs.targetStepsPerDay}
              onChange={(e) => update("targetStepsPerDay", Number(e.target.value))}
              disabled={saving}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              className="rounded-lg border border-align-border/80 bg-white px-4 py-2 text-sm font-medium text-zinc-600 shadow-sm shadow-black/[0.02] transition hover:border-align-border hover:bg-align-subtle hover:text-zinc-800 disabled:cursor-not-allowed disabled:border-align-border/60 disabled:bg-white disabled:text-zinc-500 disabled:opacity-60 disabled:shadow-none disabled:hover:bg-white"
              disabled={saving || !targetsDirty}
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
