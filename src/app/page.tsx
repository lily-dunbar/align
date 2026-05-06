import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { DexcomBackfillPrompt } from "@/components/dexcom-backfill-prompt";
import { DayInsightsPanel } from "@/components/day-insights-panel";
import { DaySummaryCards } from "@/components/day-summary-cards";
import { DateNav } from "@/components/date-nav";
import { DailyViewChart } from "@/components/daily-view-chart";
import { ManualEntryPanel } from "@/components/manual-entry-panel";
import { DailyDashboardSkeleton } from "@/components/skeleton";
import { db } from "@/db";
import { dexcomTokens } from "@/db/schema";
import { DEXCOM_SHARE_UI_HIDDEN_COOKIE } from "@/lib/dexcom/share-ui-cookie";
import { isPydexcomShareConfigured } from "@/lib/dexcom/share-sync";
import { needsOnboarding } from "@/lib/onboarding";
import { getUserPreferences } from "@/lib/user-display-preferences";

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

  let showDexcomBackfill = false;
  let dexcomShareMode = false;
  if (userId) {
    try {
      const prefs = await getUserPreferences(userId);
      dexcomShareMode = isPydexcomShareConfigured();
      const cookieStore = await cookies();
      const shareUiDismissed =
        dexcomShareMode && cookieStore.get(DEXCOM_SHARE_UI_HIDDEN_COOKIE)?.value === userId;
      const dexcomRow = await db.query.dexcomTokens.findFirst({
        where: eq(dexcomTokens.userId, userId),
        columns: { userId: true },
      });
      const dexcomConnected = !!dexcomRow || (dexcomShareMode && !shareUiDismissed);
      showDexcomBackfill = dexcomConnected && !prefs.dexcomBackfill90PromptDismissed;
    } catch (error) {
      console.warn("Skipping Dexcom backfill prompt check while DB is unavailable.", error);
      showDexcomBackfill = false;
    }
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col gap-8 bg-background px-4 py-8 md:px-8 md:py-10">
      {userId ? (
        <>
          {showDexcomBackfill ? (
            <DexcomBackfillPrompt shareCredentialsMode={dexcomShareMode} />
          ) : null}
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
        </>
      ) : null}
    </main>
  );
}
