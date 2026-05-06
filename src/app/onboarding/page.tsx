import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { eq } from "drizzle-orm";

import { OnboardingWizard } from "@/components/onboarding-wizard";
import { db } from "@/db";
import { dexcomTokens, stepIngestTokens, stravaTokens } from "@/db/schema";
import { DEXCOM_SHARE_UI_HIDDEN_COOKIE } from "@/lib/dexcom/share-ui-cookie";
import { isPydexcomShareConfigured } from "@/lib/dexcom/share-sync";
import { needsOnboarding } from "@/lib/onboarding";
import { getUserPreferences } from "@/lib/user-display-preferences";

function OnboardingFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <p className="text-sm font-medium text-zinc-500">Loading…</p>
    </div>
  );
}

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }
  if (!(await needsOnboarding(userId))) {
    redirect("/");
  }
  const prefs = await getUserPreferences(userId);

  const shareDexcom = isPydexcomShareConfigured();
  const cookieStore = await cookies();
  const shareUiDismissed =
    shareDexcom &&
    cookieStore.get(DEXCOM_SHARE_UI_HIDDEN_COOKIE)?.value === userId;

  let dexcomRow: { userId: string } | undefined;
  let stravaRow: { userId: string } | undefined;
  let stepTok: { token: string } | undefined;
  try {
    [dexcomRow, stravaRow, stepTok] = await Promise.all([
      db.query.dexcomTokens.findFirst({
        where: eq(dexcomTokens.userId, userId),
        columns: { userId: true },
      }),
      db.query.stravaTokens.findFirst({
        where: eq(stravaTokens.userId, userId),
        columns: { userId: true },
      }),
      db.query.stepIngestTokens.findFirst({
        where: eq(stepIngestTokens.userId, userId),
        columns: { token: true },
      }),
    ]);
  } catch (error) {
    console.warn("Skipping onboarding integration checks while DB is unavailable.", error);
  }

  const dexcomConnected =
    !!dexcomRow || (shareDexcom && !shareUiDismissed);
  const wizardKey = `${dexcomConnected ? "1" : "0"}-${stravaRow ? "1" : "0"}-${stepTok ? "1" : "0"}`;

  return (
    <main className="min-h-dvh bg-gradient-to-br from-[#e8f0ee] via-[#f6f7f5] to-[#ebe9df]">
      <Suspense fallback={<OnboardingFallback />}>
        <OnboardingWizard key={wizardKey} initialPrefs={prefs} />
      </Suspense>
    </main>
  );
}
