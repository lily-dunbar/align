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
const STEP_META: Record<OnboardingStepId, { title: string; emoji: string; blurb: string }> = {
  dexcom: {
    title: "Connect Dexcom",
    emoji: "🩸",
    blurb: "Link your CGM so Align can import glucose readings.",
  },
  strava: {
    title: "Connect Strava",
    emoji: "🏃",
    blurb: "Optional - import workouts for Insights and your daily chart.",
  },
  steps: {
    title: "Apple Steps",
    emoji: "👟",
    blurb: "Optional - create an ingest URL for Shortcuts, or add this later in Settings.",
  },
  display: {
    title: "Home chart",
    emoji: "📊",
    blurb: "Choose which layers appear on your 24-hour timeline.",
  },
  targets: {
    title: "Targets",
    emoji: "🎯",
    blurb: "Set your glucose range, TIR goal, and daily steps.",
  },
};

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
  "inline-flex min-w-[7.25rem] items-center justify-center rounded-full bg-[#0f6e68] px-6 py-2.5 text-sm font-medium text-white shadow-sm shadow-black/10 transition hover:bg-[#0c615c] disabled:opacity-50";

const btnSecondary =
  "inline-flex min-w-[7.25rem] items-center justify-center rounded-full border border-zinc-200 bg-white px-6 py-2.5 text-sm font-medium text-zinc-700 shadow-sm shadow-black/[0.02] transition hover:bg-zinc-50";

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
  const stravaOauthError = searchParams.get("strava_error");
  const dexcomOauthError = searchParams.get("dexcom_error");
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
  const stepMeta = STEP_META[step];

  const dexcomReturn = encodeURIComponent("/onboarding?step=strava");
  const stravaReturn = encodeURIComponent("/onboarding?step=steps");

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-3xl flex-col justify-center px-4 py-10 md:min-h-[calc(100dvh-4rem)] md:py-14">
      <h1 className="sr-only">Welcome to Align</h1>

      {error ? (
        <p className="mx-auto mt-6 w-full max-w-2xl rounded-xl border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {!error && (stravaOauthError || dexcomOauthError) ? (
        <p className="mx-auto mt-6 w-full max-w-2xl rounded-xl border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm text-red-800">
          {dexcomOauthError ? `Dexcom connection failed: ${dexcomOauthError}.` : null}
          {dexcomOauthError && stravaOauthError ? " " : null}
          {stravaOauthError ? `Strava connection failed: ${stravaOauthError}.` : null}
        </p>
      ) : null}

      <div className="mx-auto mt-9 w-full max-w-2xl rounded-[1.5rem] border border-white/85 bg-white/95 p-7 shadow-[0_26px_70px_-30px_rgba(11,48,56,0.45)] ring-1 ring-black/[0.03] md:mt-10 md:p-10">
        <p className="text-sm text-zinc-500">
          Step {idx} of {STEPS.length}
        </p>
        <h2 className="mt-3 text-[2rem] font-semibold tracking-tight text-zinc-900">{stepMeta.title}</h2>
        <p className="mt-4 max-w-xl text-[1.1rem] leading-relaxed text-zinc-700">{stepMeta.blurb}</p>
        {step === "dexcom" ? (
          <div className="mt-8 space-y-5">
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button type="button" className={btnSecondary} onClick={() => goTo("strava")}>
                Skip
              </button>
              <SettingsLink href={`/api/integrations/dexcom/connect?return_to=${dexcomReturn}`}>
                Next
              </SettingsLink>
            </div>
          </div>
        ) : null}

        {step === "strava" ? (
          <div className="mt-8 space-y-5">
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button type="button" className={btnSecondary} onClick={() => goTo("steps")}>
                Skip
              </button>
              <SettingsLink href={`/api/integrations/strava/connect?return_to=${stravaReturn}`}>
                Next
              </SettingsLink>
            </div>
            <button type="button" className={linkBack} onClick={() => goTo("dexcom")}>
              Back
            </button>
          </div>
        ) : null}

        {step === "steps" ? (
          <div className="mt-8 space-y-5">
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button type="button" className={btnSecondary} onClick={() => goTo("display")}>
                Skip
              </button>
              <button type="button" className={btnPrimary} onClick={() => void connectStepsIngest()}>
                Next
              </button>
            </div>
            <button type="button" className={linkBack} onClick={() => goTo("strava")}>
              Back
            </button>
          </div>
        ) : null}

        {step === "display" ? (
          <div className="mt-8 space-y-5">
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
            <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
              <button type="button" className={btnSecondary} onClick={() => goTo("steps")}>
                Back
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={pending}
                onClick={() => void saveDisplayAndContinue()}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}

        {step === "targets" ? (
          <div className="mt-8 space-y-6">
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
            <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
              <button type="button" className={btnSecondary} onClick={() => goTo("display")}>
                Back
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={pending}
                onClick={() => void finish()}
              >
                {pending ? "Saving…" : "Get Started"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
