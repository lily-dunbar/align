import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
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
import { uiPanelSurface } from "@/lib/ui-surfaces";
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
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 bg-background px-4 py-6 md:gap-8 md:px-8 md:py-10">
      {userId && needsTzSync ? (
        <Suspense fallback={null}>
          <PatternsTimezoneSync window={window} />
        </Suspense>
      ) : null}

      {!userId ? (
        <div className={`p-6 ${uiPanelSurface}`}>
          <p className="text-sm text-zinc-700">
            Sign in to load pattern summaries from your Dexcom, movement, sleep, and meals.
          </p>
          <p className="mt-3 text-sm text-zinc-700">
            Want to explore first? Try the{" "}
            <Link
              className="rounded-sm font-medium text-align-forest underline decoration-align-forest/35 underline-offset-2 outline-none transition hover:text-align-forest-muted hover:decoration-align-forest/55 focus-visible:ring-2 focus-visible:ring-align-forest/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              href="/demo"
            >
              public demo
            </Link>
            .
          </p>
        </div>
      ) : null}

      {userId && needsTzSync ? (
        <div className={`p-6 ${uiPanelSurface}`}>
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
