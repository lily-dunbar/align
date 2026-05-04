import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PatternSummariesSection } from "@/app/patterns/pattern-summaries-section";
import { PatternsInclusionLine } from "@/app/patterns/patterns-inclusion-line";
import { PatternsTakeawaysSection } from "@/app/patterns/patterns-takeaways-section";
import { PatternRangeFilters } from "@/components/pattern-range-filters";
import { PatternsTimezoneSync } from "@/components/patterns-timezone-sync";
import {
  PatternInclusionLineSkeleton,
  PatternWindowSummaryCardsSkeleton,
  PatternsTakeawaysSectionSkeleton,
} from "@/components/skeleton";
import { safeTimeZoneForPatterns } from "@/lib/patterns/safe-timezone";
import { parsePatternWindow } from "@/lib/patterns/window";
import { needsOnboarding } from "@/lib/onboarding";

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
  const needsTzSync = rawTz == null || rawTz === "";
  const timeZone = safeTimeZoneForPatterns(rawTz ?? undefined);

  const atIso = new Date().toISOString();

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col gap-8 bg-background px-4 py-8 md:px-8 md:py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Insights</h1>
      </header>

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
        <>
          <div className="space-y-3">
            <PatternRangeFilters active={window} timeZone={timeZone} />
            <Suspense fallback={<PatternInclusionLineSkeleton />}>
              <PatternsInclusionLine
                userId={userId}
                window={window}
                timeZone={timeZone}
                atIso={atIso}
              />
            </Suspense>
          </div>

          <Suspense fallback={<PatternWindowSummaryCardsSkeleton />}>
            <PatternSummariesSection userId={userId} window={window} atIso={atIso} />
          </Suspense>

          <Suspense fallback={<PatternsTakeawaysSectionSkeleton />}>
            <PatternsTakeawaysSection
              userId={userId}
              window={window}
              timeZone={timeZone}
              atIso={atIso}
            />
          </Suspense>
        </>
      ) : null}
    </main>
  );
}
