import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { DayInsightsPanel } from "@/components/day-insights-panel";
import { DaySummaryCards } from "@/components/day-summary-cards";
import { DateNav } from "@/components/date-nav";
import { DailyViewChart } from "@/components/daily-view-chart";
import { ManualEntryPanel } from "@/components/manual-entry-panel";
import { DailyDashboardSkeleton } from "@/components/skeleton";
import { needsOnboarding } from "@/lib/onboarding";

type HomeProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function Home({ searchParams }: HomeProps) {
  const { userId } = await auth();
  if (userId && (await needsOnboarding(userId))) {
    redirect("/onboarding");
  }
  const params = (await searchParams) ?? {};
  const dateParam = readParam(params, "date");
  const selectedDateYmd =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col gap-8 bg-background px-4 py-8 md:px-8 md:py-10">
      {userId ? (
        <Suspense fallback={<DailyDashboardSkeleton />}>
          <DateNav initialDateYmd={selectedDateYmd} />
          <ManualEntryPanel
            key={selectedDateYmd}
            dateYmd={selectedDateYmd}
            showCard={false}
          />
          <DailyViewChart dateYmd={selectedDateYmd} />
          <DaySummaryCards dateYmd={selectedDateYmd} />
          <DayInsightsPanel key={selectedDateYmd} dateYmd={selectedDateYmd} />
        </Suspense>
      ) : null}
    </main>
  );
}
