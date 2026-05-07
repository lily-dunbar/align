import { Suspense } from "react";

import { PatternSummariesSection } from "@/app/patterns/pattern-summaries-section";
import { PatternsInclusionLine } from "@/app/patterns/patterns-inclusion-line";
import { PatternsTakeawaysSection } from "@/app/patterns/patterns-takeaways-section";
import { PatternsInsightsShell } from "@/components/patterns-insights-shell";
import {
  PatternInclusionLineSkeleton,
  PatternWindowSummaryCardsSkeleton,
  PatternsTakeawaysSectionSkeleton,
} from "@/components/skeleton";
import { PUBLIC_DEMO_USER_ID } from "@/lib/demo/public-demo";
import { safeTimeZoneForPatterns } from "@/lib/patterns/safe-timezone";
import { parsePatternWindow } from "@/lib/patterns/window";

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function DemoPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const windowParam = readParam(params, "window");
  const window = parsePatternWindow(windowParam ?? undefined);
  const rawTz = readParam(params, "timeZone");
  const timeZone = safeTimeZoneForPatterns(rawTz?.trim() ? rawTz : undefined);
  const atIso = new Date().toISOString();

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col gap-8 bg-background px-4 py-8 md:px-8 md:py-10">
      <div className="rounded-2xl border border-align-border/90 bg-white/90 p-4 text-sm text-zinc-700 ring-1 ring-black/[0.03]">
        Public demo view. Data is synthetic and read-only.
      </div>
      <PatternsInsightsShell
        activeWindow={window}
        timeZone={timeZone}
        routeBasePath="/demo"
        inclusion={
          <Suspense fallback={<PatternInclusionLineSkeleton />}>
            <PatternsInclusionLine
              userId={PUBLIC_DEMO_USER_ID}
              window={window}
              timeZone={timeZone}
              atIso={atIso}
            />
          </Suspense>
        }
        summaries={
          <Suspense fallback={<PatternWindowSummaryCardsSkeleton />}>
            <PatternSummariesSection userId={PUBLIC_DEMO_USER_ID} window={window} atIso={atIso} />
          </Suspense>
        }
        takeaways={
          <Suspense fallback={<PatternsTakeawaysSectionSkeleton />}>
            <PatternsTakeawaysSection
              userId={PUBLIC_DEMO_USER_ID}
              window={window}
              timeZone={timeZone}
              atIso={atIso}
            />
          </Suspense>
        }
      />
    </main>
  );
}
