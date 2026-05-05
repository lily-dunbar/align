"use client";

import { useEffect, useState } from "react";

import { ToggleSwitch } from "@/components/toggle-switch";
import { Skeleton } from "@/components/skeleton";
import type { DisplayPreferences, UserPreferences } from "@/lib/user-display-preferences";

function sortedIanaTimeZones(): string[] {
  try {
    const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
    if (typeof intl.supportedValuesOf === "function") {
      return intl.supportedValuesOf("timeZone").slice().sort((a, b) => a.localeCompare(b));
    }
  } catch {
    /* ignore */
  }
  return [];
}

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
  const [browserTz] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
  );
  const [ianaZones] = useState(sortedIanaTimeZones);

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

  async function onTimeZoneChange(nextValue: string) {
    if (!prefs) return;
    const previous = prefs;
    const ianaTimeZone = nextValue === "__auto__" ? null : nextValue;
    const next = { ...prefs, ianaTimeZone };
    setPrefs(next);
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch("/api/settings/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ianaTimeZone }),
      });
      const json = (await resp.json()) as {
        preferences?: UserPreferences;
        error?: string;
      };
      if (!resp.ok || !json.preferences) {
        throw new Error(json.error ?? "Failed to save time zone");
      }
      setPrefs(json.preferences);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
      setPrefs(previous);
    } finally {
      setSaving(false);
    }
  }

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
    <section className="w-full rounded-2xl border border-align-border/90 bg-white/90 p-5 ring-1 ring-black/[0.03]">
      <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Display</h2>

      <div className="pt-4">
        {loading ? (
          <ul
            className="mt-4 divide-y divide-zinc-100 rounded-xl border border-zinc-100 bg-zinc-50/50"
            aria-busy="true"
            aria-label="Loading display preferences"
          >
            <li className="px-4 py-3.5 first:rounded-t-xl">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-2 h-3 w-full max-w-md" />
              <Skeleton className="mt-3 h-10 w-full rounded-lg" />
            </li>
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="flex items-center justify-between gap-4 px-4 py-3.5">
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-full max-w-xs" />
                </div>
                <Skeleton className="h-8 w-[3.25rem] shrink-0 rounded-full" />
              </li>
            ))}
          </ul>
        ) : null}
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        {prefs ? (
          <ul className="mt-4 divide-y divide-zinc-100 rounded-xl border border-zinc-100 bg-zinc-50/50">
            <li className="flex flex-col gap-1 px-4 py-3.5 first:rounded-t-xl">
              <label htmlFor="iana-time-zone" className="font-medium text-zinc-900">
                Time zone
              </label>
              <p className="text-xs text-zinc-500">
                Daily view and Insights use this for calendar-day boundaries. Automatic follows this
                device ({browserTz}).
              </p>
              <select
                id="iana-time-zone"
                disabled={saving}
                value={prefs.ianaTimeZone ?? "__auto__"}
                onChange={(e) => void onTimeZoneChange(e.target.value)}
                className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none ring-align-forest/20 focus:ring-2 disabled:opacity-60"
              >
                <option value="__auto__">Automatic ({browserTz})</option>
                {ianaZones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </li>
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
