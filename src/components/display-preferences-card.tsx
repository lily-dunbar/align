"use client";

import { useEffect, useState } from "react";

import { ToggleSwitch } from "@/components/toggle-switch";
import type { DisplayPreferences, UserPreferences } from "@/lib/user-display-preferences";

const TIMELINE_ROWS: {
  key: keyof DisplayPreferences;
  title: string;
  description: string;
}[] = [
  {
    key: "showSteps",
    title: "Steps",
    description: "Hourly step bars at the bottom of the chart.",
  },
  {
    key: "showActivity",
    title: "Activity",
    description: "Workouts and activity blocks behind the glucose line.",
  },
  {
    key: "showSleep",
    title: "Sleep",
    description: "Sleep window shading on the timeline.",
  },
  {
    key: "showFood",
    title: "Food",
    description: "Meal and carb markers on the timeline.",
  },
];

export function DisplayPreferencesCard() {
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  async function onToggle(key: keyof DisplayPreferences) {
    if (!prefs) return;
    const previous = prefs;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch("/api/settings/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next[key] }),
      });
      const json = (await resp.json()) as {
        preferences?: UserPreferences;
        error?: string;
      };
      if (!resp.ok || !json.preferences) {
        throw new Error(json.error ?? "Failed to save preferences");
      }
      setPrefs(json.preferences);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
      setPrefs(previous);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="w-full rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="border-b border-zinc-100 pb-4">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Display</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Choose what appears on the home daily chart. Glucose is always shown.
        </p>
      </div>

      <div className="pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Timeline</h3>
        <p className="mt-1 text-sm text-zinc-600">
          Toggle layers on the 24-hour timeline (steps, activity, sleep, food).
        </p>

        {loading ? <p className="mt-4 text-sm text-zinc-500">Loading preferences…</p> : null}
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        {prefs ? (
          <ul className="mt-4 divide-y divide-zinc-100 rounded-xl border border-zinc-100 bg-zinc-50/50">
            {TIMELINE_ROWS.map(({ key, title, description }) => (
              <li
                key={key}
                className="flex items-center justify-between gap-4 px-4 py-3.5 first:rounded-t-xl last:rounded-b-xl"
              >
                <div className="min-w-0">
                  <p className="font-medium text-zinc-900">{title}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
                </div>
                <ToggleSwitch
                  id={`timeline-${key}`}
                  checked={prefs[key]}
                  disabled={saving}
                  onChange={() => void onToggle(key)}
                />
              </li>
            ))}
          </ul>
        ) : null}

        {saving ? (
          <p className="mt-3 text-xs text-zinc-400" aria-live="polite">
            Saving…
          </p>
        ) : null}
      </div>
    </section>
  );
}
