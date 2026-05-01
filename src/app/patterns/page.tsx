import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";

import { PatternRangeFilters } from "@/components/pattern-range-filters";
import { PatternsInsightsPanel } from "@/components/patterns-insights-panel";
import { PatternsTimezoneSync } from "@/components/patterns-timezone-sync";
import { PatternWindowSummaryCards } from "@/components/pattern-window-summary-cards";
import { getPatternsFeatureJson } from "@/lib/patterns/feature-json";
import { getPatternWindowSummaries } from "@/lib/patterns/window-summaries";
import { safeTimeZoneForPatterns } from "@/lib/patterns/safe-timezone";
import { parsePatternWindow } from "@/lib/patterns/window";

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
  const params = (await searchParams) ?? {};
  const windowParam = readParam(params, "window");
  const window = parsePatternWindow(windowParam ?? undefined);
  const rawTz = readParam(params, "timeZone");
  const needsTzSync = rawTz == null || rawTz === "";
  const timeZone = safeTimeZoneForPatterns(rawTz ?? undefined);

  const at = new Date();
  const featureAndSummaries =
    userId && !needsTzSync
      ? await Promise.all([
          getPatternsFeatureJson(userId, window, timeZone, at),
          getPatternWindowSummaries(userId, window, at),
        ])
      : null;
  const feature = featureAndSummaries?.[0] ?? null;
  const windowSummaries = featureAndSummaries?.[1] ?? null;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col gap-6 bg-zinc-50 px-4 py-8 md:px-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Patterns</h1>
        <p className="text-sm text-zinc-600">
          BG vs time (including weekdays vs weekends), vs step count, vs logged workouts — for the
          window you select.
        </p>
      </header>

      {userId && needsTzSync ? (
        <Suspense fallback={null}>
          <PatternsTimezoneSync window={window} />
        </Suspense>
      ) : null}

      {!userId ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-zinc-700">
            Sign in to load pattern summaries from your Dexcom, steps, sleep, and meals.
          </p>
        </div>
      ) : null}

      {userId && needsTzSync ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-zinc-600">Applying your local time zone…</p>
        </div>
      ) : null}

      {userId && !needsTzSync ? (
        <div className="flex w-full flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Range</p>
          <PatternRangeFilters active={window} timeZone={timeZone} />
        </div>
      ) : null}

      {userId && windowSummaries ? (
        <PatternWindowSummaryCards data={windowSummaries} />
      ) : null}

      {userId && feature ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <PatternsInsightsPanel data={feature} />
        </div>
      ) : null}
    </main>
  );
}
