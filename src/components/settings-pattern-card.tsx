"use client";

import { useEffect, useState } from "react";

import { PatternThresholdSlider } from "@/components/pattern-threshold-slider";
import type { UserPreferences } from "@/lib/user-display-preferences";

export function SettingsPatternCard() {
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <section className="w-full rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="border-b border-zinc-100 pb-4">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Pattern</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Minimum confidence score for patterns on the Patterns tab. Open Patterns to browse
          matches for your selected date range.
        </p>
      </div>

      {loading ? <p className="mt-4 text-sm text-zinc-500">Loading…</p> : null}
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      {prefs ? (
        <div className="mt-5">
          <PatternThresholdSlider
            initialPercent={prefs.patternThresholdPercent}
            embedded
            onThresholdSaved={(n) =>
              setPrefs((p) => (p ? { ...p, patternThresholdPercent: n } : p))
            }
          />
        </div>
      ) : null}
    </section>
  );
}
