"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { ToggleSwitch } from "@/components/toggle-switch";
import { DAY_DATA_CHANGED_EVENT } from "@/lib/day-view-events";
import type { UserPreferences } from "@/lib/user-display-preferences";

type Props = {
  /** When true, only the demo-mode switch is shown (no reset tools). For allowlisted production users. */
  demoOnly?: boolean;
  initialDeveloperDemoMode: boolean;
  initialOnboardingCompleted: boolean;
};

function emitDayDataChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DAY_DATA_CHANGED_EVENT));
  }
}

export function SettingsDeveloperCard({
  demoOnly = false,
  initialDeveloperDemoMode,
  initialOnboardingCompleted,
}: Props) {
  const router = useRouter();
  const [demoMode, setDemoMode] = useState(initialDeveloperDemoMode);
  const [onboardingDone, setOnboardingDone] = useState(initialOnboardingCompleted);
  const [busy, setBusy] = useState<"demo" | "manual" | "onboard" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setDemoModeRequest = useCallback(async (next: boolean) => {
    setBusy("demo");
    setError(null);
    setMessage(null);
    try {
      const resp = await fetch("/api/settings/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ developerDemoMode: next } satisfies Partial<UserPreferences>),
      });
      const json = (await resp.json()) as { preferences?: UserPreferences; error?: string };
      if (!resp.ok) throw new Error(json.error ?? "Could not update dev mode");
      if (json.preferences) setDemoMode(json.preferences.developerDemoMode);
      router.refresh();
      emitDayDataChanged();
      setMessage(
        next
          ? "Dev mode on — Home, Patterns, and day views use sample CGM, steps, workouts, and sleep."
          : "Dev mode off — your saved data shows again where connected.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }, [router]);

  const resetManual = useCallback(async () => {
    if (
      !window.confirm(
        "Delete all manual workouts and your food/sleep entries (demo-seeded rows are kept)? This cannot be undone.",
      )
    ) {
      return;
    }
    setBusy("manual");
    setError(null);
    setMessage(null);
    try {
      const resp = await fetch("/api/settings/developer/reset-manual", { method: "POST" });
      const json = (await resp.json()) as {
        ok?: boolean;
        deleted?: { manualWorkouts: number; foodEntries: number; sleepWindows: number };
        error?: string;
      };
      if (!resp.ok) throw new Error(json.error ?? "Reset failed");
      setMessage(
        `Cleared ${json.deleted?.manualWorkouts ?? 0} workouts, ${json.deleted?.foodEntries ?? 0} food, ${json.deleted?.sleepWindows ?? 0} sleep.`,
      );
      emitDayDataChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(null);
    }
  }, []);

  const resetOnboarding = useCallback(async () => {
    if (!window.confirm("Mark onboarding as not completed? (For future first-run UI.)")) return;
    setBusy("onboard");
    setError(null);
    setMessage(null);
    try {
      const resp = await fetch("/api/settings/developer/reset-onboarding", { method: "POST" });
      const json = (await resp.json()) as { preferences?: UserPreferences; error?: string };
      if (!resp.ok) throw new Error(json.error ?? "Reset failed");
      if (json.preferences) setOnboardingDone(json.preferences.onboardingCompleted);
      setMessage("Onboarding flag cleared.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(null);
    }
  }, []);

  return (
    <section className="w-full rounded-2xl border border-align-border/90 bg-white/90 p-5 text-left ring-1 ring-black/[0.03]">
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-align-muted">
        {demoOnly ? "Dev mode" : "Developer"}
      </h2>

      <div className="mt-4 divide-y divide-zinc-100 rounded-xl border border-zinc-100 bg-zinc-50/50">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-900">Dev mode</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Shows the yellow banner and loads sample data across Home and Patterns. Turn off anytime to use
              your real data on this device.
            </p>
          </div>
          <ToggleSwitch
            id="dev-mode-toggle"
            checked={demoMode}
            disabled={busy === "demo"}
            onChange={() => void setDemoModeRequest(!demoMode)}
          />
        </div>

        {demoOnly ? null : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
              <div>
                <p className="text-sm font-medium text-zinc-900">Reset manual entries</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Workouts, food, and sleep you added (keeps demo-seeded food/sleep).
                </p>
              </div>
              <button
                type="button"
                className="inline-flex min-w-[8.25rem] items-center justify-center rounded-full border border-red-200 bg-white px-3 py-1 text-sm font-medium text-red-800 shadow-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={busy !== null}
                onClick={() => void resetManual()}
              >
                {busy === "manual" ? "Working…" : "Reset manual"}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
              <div>
                <p className="text-sm font-medium text-zinc-900">Reset onboarding</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Sets onboarding to incomplete for future first-run flows.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">{onboardingDone ? "Done" : "Pending"}</span>
                <button
                  type="button"
                  className="inline-flex min-w-[9.25rem] items-center justify-center rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={busy !== null}
                  onClick={() => void resetOnboarding()}
                >
                  {busy === "onboard" ? "Working…" : "Reset onboarding"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="mt-3 text-sm text-emerald-800">{message}</p> : null}
    </section>
  );
}
