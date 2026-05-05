import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PatternSummariesSection } from "@/app/patterns/pattern-summaries-section";
import { PatternsInclusionLine } from "@/app/patterns/patterns-inclusion-line";
import { PatternsTakeawaysSection } from "@/app/patterns/patterns-takeaways-section";
import { PatternsInsightsShell } from "@/components/patterns-insights-shell";
import { PatternsTimezoneSync } from "@/components/patterns-timezone-sync";
import {
  PatternInclusionLineSkeleton,
  PatternWindowSummaryCardsSkeleton,
  PatternsTakeawaysSectionSkeleton,
} from "@/components/skeleton";
import { needsOnboarding } from "@/lib/onboarding";
import { safeTimeZoneForPatterns } from "@/lib/patterns/safe-timezone";
import { parsePatternWindow } from "@/lib/patterns/window";
import { getUserPreferences } from "@/lib/user-display-preferences";

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function PatternsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { userId } = await auth();
  if (userId && (await needsOnboarding(userId))) {
    redirect("/onboarding");
  }
  const params = (await searchParams) ?? {};
  const windowParam = readParam(params, "window");
  const window = parsePatternWindow(windowParam ?? undefined);
  const rawTz = readParam(params, "timeZone");
  const prefs = userId ? await getUserPreferences(userId) : null;
  const savedTz = prefs?.ianaTimeZone?.trim();
  const needsTzSync = Boolean(userId && !rawTz?.trim() && !savedTz);
  const timeZone = rawTz?.trim()
    ? safeTimeZoneForPatterns(rawTz)
    : savedTz
      ? safeTimeZoneForPatterns(savedTz)
      : safeTimeZoneForPatterns(undefined);

  const atIso = new Date().toISOString();

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col gap-8 bg-background px-4 py-8 md:px-8 md:py-10">
      {userId && needsTzSync ? (
        <Suspense fallback={null}>
          <PatternsTimezoneSync window={window} />
        </Suspense>
      ) : null}

      {!userId ? (
        <div className="rounded-2xl border border-align-border/90 bg-white/90 p-6 ring-1 ring-black/[0.03]">
          <p className="text-sm text-zinc-700">
            Sign in to load pattern summaries from your Dexcom, movement, sleep, and meals.
          </p>
        </div>
      ) : null}

      {userId && needsTzSync ? (
        <div className="rounded-2xl border border-align-border/90 bg-white/90 p-6 ring-1 ring-black/[0.03]">
          <p className="text-sm text-zinc-600">Applying your local time zone…</p>
        </div>
      ) : null}

      {userId && !needsTzSync ? (
        <PatternsInsightsShell
          activeWindow={window}
          timeZone={timeZone}
          inclusion={
            <Suspense fallback={<PatternInclusionLineSkeleton />}>
              <PatternsInclusionLine
                userId={userId}
                window={window}
                timeZone={timeZone}
                atIso={atIso}
              />
            </Suspense>
          }
          summaries={
            <Suspense fallback={<PatternWindowSummaryCardsSkeleton />}>
              <PatternSummariesSection userId={userId} window={window} atIso={atIso} />
            </Suspense>
          }
          takeaways={
            <Suspense fallback={<PatternsTakeawaysSectionSkeleton />}>
              <PatternsTakeawaysSection
                userId={userId}
                window={window}
                timeZone={timeZone}
                atIso={atIso}
              />
            </Suspense>
          }
        />
      ) : null}
    </main>
  );
}
