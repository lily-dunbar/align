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

const STEPS = ["dexcom", "strava", "apple_steps", "display", "targets", "success"] as const;
export type OnboardingStepId = (typeof STEPS)[number];
const STEP_META: Record<OnboardingStepId, { title: string; emoji: string; blurb: string }> = {
  dexcom: {
    title: "Dexcom Setup",
    emoji: "🩸",
    blurb: "Connect your Dexcom account so Align can import glucose readings.",
  },
  strava: {
    title: "Strava Setup",
    emoji: "🏃",
    blurb: "Connect your Strava account so Align can import workouts.",
  },
  apple_steps: {
    title: "Apple Activity Data",
    emoji: "🍎",
    blurb: "Connect your Apple account so Align can import step count data.",
  },
  display: {
    title: "User Preferences",
    emoji: "📊",
    blurb: "Which data do you wish to see on your timeline? You can always edit this later in Settings",
  },
  targets: {
    title: "Targets",
    emoji: "🎯",
    blurb: "Set your glucose range, TIR goal, and daily steps. You can change these anytime in Settings.",
  },
  success: {
    title: "You’re all set",
    emoji: "✨",
    blurb:
      "As a reminder, this app is not meant to provide medical advice. Please consult your doctor before changing any settings or adjusting your care routine.",
  },
};

function isStepId(s: string | null): s is OnboardingStepId {
  return s !== null && (STEPS as readonly string[]).includes(s);
}

type SkipAction = { type: "navigate"; step: OnboardingStepId } | { type: "finish" };

/** Debug: advance without OAuth / without saving (except finish). */
function getSkipAction(step: OnboardingStepId): SkipAction | null {
  if (step === "success") return { type: "finish" };
  const idx = STEPS.indexOf(step);
  if (idx < 0 || idx >= STEPS.length - 1) return null;
  return { type: "navigate", step: STEPS[idx + 1] };
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
  "inline-flex min-w-[8rem] items-center justify-center rounded-full bg-[#0f6e68] px-6 py-2.5 text-sm font-medium text-white shadow-sm shadow-black/10 transition hover:bg-[#0c615c] disabled:opacity-50";

const btnSecondary =
  "inline-flex min-w-[8rem] items-center justify-center rounded-full border border-zinc-200 bg-white px-6 py-2.5 text-sm font-medium text-zinc-700 shadow-sm shadow-black/[0.02] transition hover:bg-zinc-50 disabled:opacity-40";

const linkSkip =
  "inline cursor-pointer border-0 bg-transparent p-0 text-sm font-medium text-zinc-400 underline decoration-zinc-300/80 underline-offset-[0.25em] transition hover:text-zinc-600 hover:decoration-zinc-500 disabled:pointer-events-none disabled:opacity-40";

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
      const p = new URLSearchParams(searchParams.toString());
      p.set("step", next);
      router.replace(`/onboarding?${p.toString()}`);
    },
    [router, searchParams],
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

  async function saveDisplayAndContinue() {
    setError(null);
    try {
      await patchPrefs({
        showSteps: prefs.showSteps,
        showActivity: prefs.showActivity,
        showSleep: prefs.showSleep,
        showFood: prefs.showFood,
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
          onboardingCompleted: true,
        });
        router.replace("/");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not finish onboarding");
      }
    });
  }

  async function saveTargetsAndContinue() {
    setError(null);
    try {
      await patchPrefs({
        targetLowMgdl: prefs.targetLowMgdl,
        targetHighMgdl: prefs.targetHighMgdl,
        targetTirPercent: prefs.targetTirPercent,
        targetStepsPerDay: prefs.targetStepsPerDay,
      });
      goTo("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  function update<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    setPrefs((p) => ({ ...p, [key]: value }));
  }

  const idx = STEPS.indexOf(step) + 1;
  const stepMeta = STEP_META[step];
  const progress = (idx / STEPS.length) * 100;
  const skipAction = getSkipAction(step);

  const dexcomReturn = encodeURIComponent("/onboarding?step=strava");
  const stravaReturn = encodeURIComponent("/onboarding?step=apple_steps");

  function handleSkip() {
    if (!skipAction) return;
    if (skipAction.type === "finish") {
      void finish();
      return;
    }
    goTo(skipAction.step);
  }

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

      <div className="mx-auto mt-9 w-full max-w-2xl rounded-[1.5rem] border border-white/85 bg-white/95 p-6 shadow-[0_26px_70px_-30px_rgba(11,48,56,0.45)] ring-1 ring-black/[0.03] md:mt-10 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
          Step {idx} of {STEPS.length}
        </p>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full bg-[#0f6e68] transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <h2 className="mt-6 text-xl font-semibold tracking-tight text-zinc-900 md:text-[1.35rem] md:leading-snug">
          {stepMeta.title}
        </h2>
        <p className="mt-4 max-w-xl text-base font-normal leading-relaxed text-zinc-700">
          {stepMeta.blurb}
        </p>
        {step === "dexcom" ? (
          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button type="button" className={btnSecondary} onClick={() => goTo("dexcom")} disabled>
                Previous
              </button>
              <SettingsLink href={`/api/integrations/dexcom/connect?return_to=${dexcomReturn}`}>
                Next
              </SettingsLink>
            </div>
            {skipAction ? (
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  className={linkSkip}
                  disabled={pending}
                  onClick={() => handleSkip()}
                >
                  Skip
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "strava" ? (
          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button type="button" className={btnSecondary} onClick={() => goTo("dexcom")}>
                Previous
              </button>
              <SettingsLink href={`/api/integrations/strava/connect?return_to=${stravaReturn}`}>
                Next
              </SettingsLink>
            </div>
            {skipAction ? (
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  className={linkSkip}
                  disabled={pending}
                  onClick={() => handleSkip()}
                >
                  Skip
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "apple_steps" ? (
          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button type="button" className={btnSecondary} onClick={() => goTo("strava")}>
                Previous
              </button>
              <button type="button" className={btnPrimary} onClick={() => goTo("display")}>
                Next
              </button>
            </div>
            {skipAction ? (
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  className={linkSkip}
                  disabled={pending}
                  onClick={() => handleSkip()}
                >
                  Skip
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "display" ? (
          <div className="mt-6 space-y-5">
            <ul className="divide-y divide-align-border-soft rounded-xl border border-align-border/80 bg-align-subtle/40">
              {DISPLAY_KEYS.map(({ key, title }) => (
                <li
                  key={key}
                  className="flex items-center justify-between gap-4 px-4 py-3.5 first:rounded-t-xl last:rounded-b-xl"
                >
                  <span className="font-medium text-zinc-900">
                    {title}
                    {key === "showSteps" ? (
                      <span className="mt-0.5 block text-sm font-normal text-zinc-600">
                        Hourly step bars at the bottom of the chart
                      </span>
                    ) : null}
                    {key === "showActivity" ? (
                      <span className="mt-0.5 block text-sm font-normal text-zinc-600">
                        Workouts and activity blocks
                      </span>
                    ) : null}
                    {key === "showSleep" ? (
                      <span className="mt-0.5 block text-sm font-normal text-zinc-600">
                        Sleep window shading
                      </span>
                    ) : null}
                    {key === "showFood" ? (
                      <span className="mt-0.5 block text-sm font-normal text-zinc-600">
                        Meal and carb markers
                      </span>
                    ) : null}
                  </span>
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
              <button type="button" className={btnSecondary} onClick={() => goTo("apple_steps")}>
                Previous
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
            {skipAction ? (
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  className={linkSkip}
                  disabled={pending}
                  onClick={() => handleSkip()}
                >
                  Skip
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "targets" ? (
          <div className="mt-6 space-y-6">
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
                Previous
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={pending}
                onClick={() => void saveTargetsAndContinue()}
              >
                Next
              </button>
            </div>
            {skipAction ? (
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  className={linkSkip}
                  disabled={pending}
                  onClick={() => handleSkip()}
                >
                  Skip
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "success" ? (
          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
              <button type="button" className={btnSecondary} onClick={() => goTo("targets")}>
                Previous
              </button>
              <button type="button" className={btnPrimary} disabled={pending} onClick={() => void finish()}>
                {pending ? "Saving…" : "Get started"}
              </button>
            </div>
            {skipAction ? (
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  className={linkSkip}
                  disabled={pending}
                  onClick={() => handleSkip()}
                >
                  Skip
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
