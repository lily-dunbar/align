import { and, count, desc, eq, sum } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DexcomBackfillPrompt } from "@/components/dexcom-backfill-prompt";
import { SettingsAccountCard } from "@/components/settings-account-card";
import { DisplayPreferencesCard } from "@/components/display-preferences-card";
import { SettingsDeveloperCard } from "@/components/settings-developer-card";
import { SettingsTargetsCard } from "@/components/settings-targets-card";
import {
  SettingsIntegrations,
  type IntegrationSnapshot,
} from "@/components/settings-integrations";
import { db } from "@/db";
import {
  activities,
  dexcomTokens,
  glucoseReadings,
  hourlySteps,
  stepIngestTokens,
  stravaTokens,
  userDisplayPreferences,
} from "@/db/schema";
import { isDeveloperSettingsEnabled } from "@/lib/developer-settings";
import { needsOnboarding } from "@/lib/onboarding";
import { getUserPreferences } from "@/lib/user-display-preferences";
import { DEXCOM_SHARE_UI_HIDDEN_COOKIE } from "@/lib/dexcom/share-ui-cookie";
import { isPydexcomShareConfigured } from "@/lib/dexcom/share-sync";

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }
  if (await needsOnboarding(userId)) {
    redirect("/onboarding");
  }

  const params = (await searchParams) ?? {};
  const dexcomCb = readParam(params, "dexcom");
  const stravaCb = readParam(params, "strava");
  const dexcomErr = readParam(params, "dexcom_error");
  const stravaErr = readParam(params, "strava_error");

  const shareDexcom = isPydexcomShareConfigured();
  const cookieStore = await cookies();
  const shareUiDismissed =
    shareDexcom &&
    cookieStore.get(DEXCOM_SHARE_UI_HIDDEN_COOKIE)?.value === userId;
  let dexcomRow: { userId: string } | undefined;
  let stravaRow: { userId: string } | undefined;
  let stepTok: { token: string } | undefined;
  let lastDexcomAt: string | null = null;
  let lastStravaAt: string | null = null;
  let lastStepsAt: string | null = null;
  let lastStepsStored: {
    bucketStartIso: string;
    stepCount: number;
    source: string;
    receivedAtIso: string;
  } | null = null;
  let recentStepRows: Array<{
    bucketStart: Date;
    stepCount: number;
    source: string;
    receivedAt: Date;
  }> = [];
  let dexcomReadingCount = 0;
  let stravaActivityCount = 0;
  let stepsTotalCount = 0;

  try {
    dexcomRow = await db.query.dexcomTokens.findFirst({
      where: eq(dexcomTokens.userId, userId),
      columns: { userId: true },
    });
    stravaRow = await db.query.stravaTokens.findFirst({
      where: eq(stravaTokens.userId, userId),
      columns: { userId: true },
    });
    stepTok = await db.query.stepIngestTokens.findFirst({
      where: eq(stepIngestTokens.userId, userId),
      columns: { token: true },
    });

    const lastDexcomGlucoseRow =
      dexcomRow || shareDexcom
        ? await db.query.glucoseReadings.findFirst({
            where: and(
              eq(glucoseReadings.userId, userId),
              eq(glucoseReadings.source, "dexcom"),
            ),
            orderBy: [desc(glucoseReadings.updatedAt)],
            columns: { updatedAt: true },
          })
        : null;
    lastDexcomAt = lastDexcomGlucoseRow?.updatedAt.toISOString() ?? null;

    lastStravaAt = stravaRow
      ? (
          await db.query.activities.findFirst({
            where: and(eq(activities.userId, userId), eq(activities.provider, "strava")),
            orderBy: [desc(activities.updatedAt)],
            columns: { updatedAt: true },
          })
        )?.updatedAt.toISOString() ?? null
      : null;

    const lastStepsRow = await db.query.hourlySteps.findFirst({
      where: eq(hourlySteps.userId, userId),
      orderBy: [desc(hourlySteps.receivedAt)],
      columns: {
        receivedAt: true,
        bucketStart: true,
        stepCount: true,
        source: true,
      },
    });
    lastStepsAt = lastStepsRow?.receivedAt.toISOString() ?? null;
    lastStepsStored =
      lastStepsRow != null
        ? {
            bucketStartIso: lastStepsRow.bucketStart.toISOString(),
            stepCount: lastStepsRow.stepCount,
            source: lastStepsRow.source,
            receivedAtIso: lastStepsRow.receivedAt.toISOString(),
          }
        : null;
    recentStepRows = await db.query.hourlySteps.findMany({
      where: eq(hourlySteps.userId, userId),
      orderBy: [desc(hourlySteps.receivedAt)],
      limit: 96,
      columns: {
        bucketStart: true,
        stepCount: true,
        source: true,
        receivedAt: true,
      },
    });

    const [dexcomReadingsAgg] = await db
      .select({ n: count() })
      .from(glucoseReadings)
      .where(
        and(eq(glucoseReadings.userId, userId), eq(glucoseReadings.source, "dexcom")),
      );

    const [stravaActivityAgg] = await db
      .select({ n: count() })
      .from(activities)
      .where(and(eq(activities.userId, userId), eq(activities.provider, "strava")));

    const [stepsSumAgg] = await db
      .select({ total: sum(hourlySteps.stepCount) })
      .from(hourlySteps)
      .where(eq(hourlySteps.userId, userId));

    dexcomReadingCount = Number(dexcomReadingsAgg?.n ?? 0);
    stravaActivityCount = Number(stravaActivityAgg?.n ?? 0);
    stepsTotalCount = Number(stepsSumAgg?.total ?? 0);
  } catch (error) {
    console.warn("Settings data unavailable while DB is overloaded.", error);
  }

  const showDeveloperSettings = isDeveloperSettingsEnabled();

  let userPrefs = await getUserPreferences(userId);
  const dexcomConnected = !!dexcomRow || (shareDexcom && !shareUiDismissed);
  const showDexcomBackfillPrompt =
    dexcomConnected && !userPrefs.dexcomBackfill90PromptDismissed;

  let developerPrefsRow:
    | { developerDemoMode: boolean | null; onboardingCompleted: boolean | null }
    | undefined;
  try {
    developerPrefsRow = await db.query.userDisplayPreferences.findFirst({
      where: eq(userDisplayPreferences.userId, userId),
      columns: { developerDemoMode: true, onboardingCompleted: true },
    });
  } catch (error) {
    console.warn("Developer preference row unavailable in settings.", error);
    developerPrefsRow = undefined;
  }

  const initial: IntegrationSnapshot = {
    dexcom: {
      connected: !!dexcomRow || (shareDexcom && !shareUiDismissed),
      lastSyncAt: lastDexcomAt,
      shareCredentialsMode: shareDexcom,
      shareUiDismissed,
      readingCount: dexcomReadingCount,
    },
    strava: {
      connected: !!stravaRow,
      lastSyncAt: lastStravaAt,
      activityCount: stravaActivityCount,
    },
    steps: {
      connected: !!stepTok,
      lastIngestAt: lastStepsAt,
      stepsTotalStored: stepsTotalCount,
      lastStored: lastStepsStored,
      recentRows: recentStepRows.map((r) => ({
        bucketStartIso: r.bucketStart.toISOString(),
        stepCount: r.stepCount,
        source: r.source,
        receivedAtIso: r.receivedAt.toISOString(),
      })),
    },
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 bg-background px-4 py-8 md:max-w-4xl md:px-8 md:py-10">
      {dexcomCb === "connected" ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Dexcom connected successfully.
        </p>
      ) : null}
      {stravaCb === "connected" ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Strava connected successfully.
        </p>
      ) : null}
      {dexcomErr ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Dexcom: {dexcomErr}
        </p>
      ) : null}
      {stravaErr ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Strava: {stravaErr}
        </p>
      ) : null}

      {showDexcomBackfillPrompt ? (
        <DexcomBackfillPrompt shareCredentialsMode={shareDexcom} />
      ) : null}

      <SettingsIntegrations
        key={`dex:${initial.dexcom.connected}-strava:${initial.strava.connected}-steps:${initial.steps.connected}`}
        initial={initial}
      />

      <DisplayPreferencesCard />
      <SettingsTargetsCard />

      <SettingsAccountCard />

      {showDeveloperSettings ? (
        <SettingsDeveloperCard
          initialDeveloperDemoMode={developerPrefsRow?.developerDemoMode ?? false}
          initialOnboardingCompleted={developerPrefsRow?.onboardingCompleted ?? true}
        />
      ) : (
        <SettingsDeveloperCard
          demoOnly
          initialDeveloperDemoMode={developerPrefsRow?.developerDemoMode ?? false}
          initialOnboardingCompleted={developerPrefsRow?.onboardingCompleted ?? true}
        />
      )}
    </main>
  );
}
