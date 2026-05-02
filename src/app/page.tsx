import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";

import { DaySummaryCards } from "@/components/day-summary-cards";
import { DateNav } from "@/components/date-nav";
import { DailyViewChart } from "@/components/daily-view-chart";
import { ManualEntryPanel } from "@/components/manual-entry-panel";

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
  const params = (await searchParams) ?? {};
  const dateParam = readParam(params, "date");
  const selectedDateYmd =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col gap-6 bg-zinc-50 px-4 py-8 md:px-8">
      {userId ? (
        <Suspense
          fallback={
            <div className="min-h-[22rem] w-full animate-pulse rounded-2xl bg-zinc-100" />
          }
        >
          <DateNav initialDateYmd={selectedDateYmd} />
          <ManualEntryPanel
            key={selectedDateYmd}
            dateYmd={selectedDateYmd}
            showCard={false}
          />
          <DailyViewChart dateYmd={selectedDateYmd} />
          <DaySummaryCards dateYmd={selectedDateYmd} />
        </Suspense>
      ) : null}

      <p className="mt-auto border-t border-zinc-200/90 pt-6 text-center text-sm text-zinc-500">
        Metabolic intelligence for daily diabetes decisions.
      </p>
    </main>
  );
}
