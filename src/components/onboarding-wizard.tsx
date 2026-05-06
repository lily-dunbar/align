"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import { ToggleSwitch } from "@/components/toggle-switch";
import type { DisplayPreferences, UserPreferences } from "@/lib/user-display-preferences";
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

const STEPS = ["dexcom", "strava", "steps", "display", "targets"] as const;
export type OnboardingStepId = (typeof STEPS)[number];

function isStepId(s: string | null): s is OnboardingStepId {
  return s !== null && (STEPS as readonly string[]).includes(s);
}

const DISPLAY_KEYS: {
  key: keyof DisplayPreferences;
  title: string;
}[] = [
  { key: "showSteps", title: "Steps" },
  { key: "showActivity", title: "Activity" },
  { key: "showSleep", title: "Sleep" },
  { key: "showFood", title: "Food" },
];

const btnPrimary =
  "inline-flex items-center justify-center rounded-full bg-align-forest px-6 py-2.5 text-sm font-medium text-white shadow-sm shadow-black/10 transition hover:bg-align-forest-muted disabled:opacity-50";

const btnSecondary =
  "inline-flex items-center justify-center rounded-full border border-zinc-200/90 bg-white px-6 py-2.5 text-sm font-medium text-zinc-800 shadow-sm shadow-black/[0.02] transition hover:bg-zinc-50";

const linkBack =
  "text-sm font-medium text-zinc-500 transition hover:text-zinc-900";

function SettingsLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} className={btnPrimary}>
      {children}
    </a>
  );
}

export function OnboardingWizard({ initialPrefs }: { initialPrefs: UserPreferences }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawStep = searchParams.get("step");
  const step: OnboardingStepId = isStepId(rawStep) ? rawStep : "dexcom";

  const [prefs, setPrefs] = useState(initialPrefs);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const goTo = useCallback(
    (next: OnboardingStepId) => {
      router.replace(`/onboarding?step=${next}`);
    },
    [router],
  );

  const patchPrefs = useCallback(async (patch: Partial<UserPreferences>) => {
    const resp = await fetch("/api/settings/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = (await resp.json()) as { preferences?: UserPreferences; error?: string };
    if (!resp.ok || !json.preferences) {
      throw new Error(json.error ?? "Could not save");
    }
    setPrefs(json.preferences);
  }, []);

  async function connectStepsIngest() {
    setError(null);
    try {
      const resp = await fetch("/api/ingest/steps/token", {
        method: "GET",
        credentials: "include",
      });
      const text = await resp.text();
      let j: { error?: string } = {};
      if (text) {
        try {
          j = JSON.parse(text) as { error?: string };
        } catch {
          throw new Error(`Connect failed (${resp.status})`);
        }
      }
      if (!resp.ok) throw new Error(j.error ?? `Could not connect (${resp.status})`);
      router.refresh();
      goTo("display");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connect failed");
    }
  }

  async function saveDisplayAndContinue() {
    setError(null);
    try {
      await patchPrefs({
        showSteps: prefs.showSteps,
        showActivity: prefs.showActivity,
        showSleep: prefs.showSleep,
        showFood: prefs.showFood,
        showCarbsLoggedSummary: prefs.showCarbsLoggedSummary,
      });
      goTo("targets");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function finish() {
    setError(null);
    startTransition(async () => {
      try {
        await patchPrefs({
          targetLowMgdl: prefs.targetLowMgdl,
          targetHighMgdl: prefs.targetHighMgdl,
          targetTirPercent: prefs.targetTirPercent,
          targetStepsPerDay: prefs.targetStepsPerDay,
          onboardingCompleted: true,
        });
        router.replace("/");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not finish onboarding");
      }
    });
  }

  function update<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    setPrefs((p) => ({ ...p, [key]: value }));
  }

  const idx = STEPS.indexOf(step) + 1;

  const dexcomReturn = encodeURIComponent("/onboarding?step=strava");
  const stravaReturn = encodeURIComponent("/onboarding?step=steps");

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-lg flex-col justify-center px-4 py-10 md:min-h-[calc(100dvh-4rem)] md:py-14">
      <p className="text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        Step {idx} of {STEPS.length}
      </p>
      <h1 className="mt-3 text-center text-[1.65rem] font-semibold leading-tight tracking-tight text-zinc-900 md:text-3xl">
        Welcome to Align
      </h1>

      {error ? (
        <p className="mt-6 rounded-xl border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="mt-9 rounded-2xl border border-white/80 bg-white/90 p-6 shadow-[0_12px_48px_-16px_rgba(27,77,67,0.14)] ring-1 ring-black/[0.04] backdrop-blur-sm md:mt-10 md:p-8">
        {step === "dexcom" ? (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Connect Dexcom</h2>
            <p className="text-sm leading-relaxed text-zinc-600">
              Link your CGM so Align can import glucose readings.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <SettingsLink href={`/api/integrations/dexcom/connect?return_to=${dexcomReturn}`}>
                Connect Dexcom
              </SettingsLink>
              <button type="button" className={btnSecondary} onClick={() => goTo("strava")}>
                Skip
              </button>
            </div>
          </div>
        ) : null}

        {step === "strava" ? (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Connect Strava</h2>
            <p className="text-sm leading-relaxed text-zinc-600">
              Optional — import workouts for the Insights page and your daily chart.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <SettingsLink href={`/api/integrations/strava/connect?return_to=${stravaReturn}`}>
                Connect Strava
              </SettingsLink>
              <button type="button" className={btnSecondary} onClick={() => goTo("steps")}>
                Skip
              </button>
            </div>
            <button type="button" className={linkBack} onClick={() => goTo("dexcom")}>
              Back
            </button>
          </div>
        ) : null}

        {step === "steps" ? (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Apple Steps</h2>
            <p className="text-sm leading-relaxed text-zinc-600">
              Optional — create an ingest URL for Shortcuts, or skip and add this later in Settings.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button type="button" className={btnPrimary} onClick={() => void connectStepsIngest()}>
                Connect
              </button>
              <button type="button" className={btnSecondary} onClick={() => goTo("display")}>
                Skip
              </button>
            </div>
            <button type="button" className={linkBack} onClick={() => goTo("strava")}>
              Back
            </button>
          </div>
        ) : null}

        {step === "display" ? (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Home chart</h2>
            <p className="text-sm leading-relaxed text-zinc-600">
              Choose which layers appear on your 24-hour timeline (glucose is always on).
            </p>
            <ul className="divide-y divide-align-border-soft rounded-xl border border-align-border/80 bg-align-subtle/40">
              {DISPLAY_KEYS.map(({ key, title }) => (
                <li
                  key={key}
                  className="flex items-center justify-between gap-4 px-4 py-3.5 first:rounded-t-xl last:rounded-b-xl"
                >
                  <span className="font-medium text-zinc-900">{title}</span>
                  <ToggleSwitch
                    id={`onboard-${key}`}
                    checked={prefs[key]}
                    disabled={pending}
                    onChange={() => update(key, !prefs[key])}
                  />
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                className={btnPrimary}
                disabled={pending}
                onClick={() => void saveDisplayAndContinue()}
              >
                Continue
              </button>
              <button type="button" className={linkBack} onClick={() => goTo("steps")}>
                Back
              </button>
            </div>
          </div>
        ) : null}

        {step === "targets" ? (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Targets</h2>
            <p className="text-sm leading-relaxed text-zinc-600">
              Set your glucose range, TIR goal, and daily steps. You can change these anytime in
              Settings.
            </p>
            <div className="space-y-3">
              <label className="flex items-center justify-between gap-4 text-sm">
                <span className="text-zinc-700">Low (mg/dL)</span>
                <input
                  type="number"
                  className="w-24 rounded-lg border border-zinc-200 bg-white px-2 py-2 text-right tabular-nums shadow-sm"
                  min={GLUCOSE_LOW_MIN}
                  max={GLUCOSE_LOW_MAX}
                  value={prefs.targetLowMgdl}
                  onChange={(e) => update("targetLowMgdl", Number(e.target.value))}
                />
              </label>
              <label className="flex items-center justify-between gap-4 text-sm">
                <span className="text-zinc-700">High (mg/dL)</span>
                <input
                  type="number"
                  className="w-24 rounded-lg border border-zinc-200 bg-white px-2 py-2 text-right tabular-nums shadow-sm"
                  min={GLUCOSE_HIGH_MIN}
                  max={GLUCOSE_HIGH_MAX}
                  value={prefs.targetHighMgdl}
                  onChange={(e) => update("targetHighMgdl", Number(e.target.value))}
                />
              </label>
              <label className="flex items-center justify-between gap-4 text-sm">
                <span className="text-zinc-700">
                  Target TIR ({TARGET_TIR_MIN}–{TARGET_TIR_MAX}%)
                </span>
                <input
                  type="number"
                  className="w-24 rounded-lg border border-zinc-200 bg-white px-2 py-2 text-right tabular-nums shadow-sm"
                  min={TARGET_TIR_MIN}
                  max={TARGET_TIR_MAX}
                  value={prefs.targetTirPercent}
                  onChange={(e) => update("targetTirPercent", Number(e.target.value))}
                />
              </label>
              <label className="flex items-center justify-between gap-4 text-sm">
                <span className="text-zinc-700">Steps / day</span>
                <input
                  type="number"
                  className="w-24 rounded-lg border border-zinc-200 bg-white px-2 py-2 text-right tabular-nums shadow-sm"
                  min={TARGET_STEPS_MIN}
                  max={TARGET_STEPS_MAX}
                  step={500}
                  value={prefs.targetStepsPerDay}
                  onChange={(e) => update("targetStepsPerDay", Number(e.target.value))}
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                className={btnPrimary}
                disabled={pending}
                onClick={() => void finish()}
              >
                {pending ? "Saving…" : "Finish"}
              </button>
              <button type="button" className={linkBack} onClick={() => goTo("display")}>
                Back
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
