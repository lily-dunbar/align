import { and, desc, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { DisplayPreferencesCard } from "@/components/display-preferences-card";
import { SettingsPatternCard } from "@/components/settings-pattern-card";
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
} from "@/db/schema";

function appBaseUrl() {
  return (process.env.AUTH_URL ?? "http://localhost:4000").replace(/\/$/, "");
}

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

  const params = (await searchParams) ?? {};
  const dexcomCb = readParam(params, "dexcom");
  const stravaCb = readParam(params, "strava");
  const dexcomErr = readParam(params, "dexcom_error");
  const stravaErr = readParam(params, "strava_error");

  const dexcomRow = await db.query.dexcomTokens.findFirst({
    where: eq(dexcomTokens.userId, userId),
    columns: { userId: true },
  });
  const stravaRow = await db.query.stravaTokens.findFirst({
    where: eq(stravaTokens.userId, userId),
    columns: { userId: true },
  });
  const stepTok = await db.query.stepIngestTokens.findFirst({
    where: eq(stepIngestTokens.userId, userId),
    columns: { token: true },
  });

  const base = appBaseUrl();

  const lastDexcomAt = dexcomRow
    ? (
        await db.query.glucoseReadings.findFirst({
          where: and(
            eq(glucoseReadings.userId, userId),
            eq(glucoseReadings.source, "dexcom"),
          ),
          orderBy: [desc(glucoseReadings.updatedAt)],
          columns: { updatedAt: true },
        })
      )?.updatedAt.toISOString() ?? null
    : null;

  const lastStravaAt = stravaRow
    ? (
        await db.query.activities.findFirst({
          where: and(eq(activities.userId, userId), eq(activities.provider, "strava")),
          orderBy: [desc(activities.updatedAt)],
          columns: { updatedAt: true },
        })
      )?.updatedAt.toISOString() ?? null
    : null;

  const lastStepsAt = stepTok
    ? (
        await db.query.hourlySteps.findFirst({
          where: eq(hourlySteps.userId, userId),
          orderBy: [desc(hourlySteps.receivedAt)],
          columns: { receivedAt: true },
        })
      )?.receivedAt.toISOString() ?? null
    : null;

  const initial: IntegrationSnapshot = {
    dexcom: {
      connected: !!dexcomRow,
      lastSyncAt: lastDexcomAt,
    },
    strava: {
      connected: !!stravaRow,
      lastSyncAt: lastStravaAt,
    },
    steps: {
      connected: !!stepTok,
      lastIngestAt: lastStepsAt,
      ingestUrl: stepTok ? `${base}/api/ingest/steps/${stepTok.token}` : null,
    },
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 bg-zinc-50 px-4 py-8 md:max-w-4xl md:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Targets, pattern threshold, display timeline, then Dexcom, Strava, and Apple Steps.
        </p>
      </div>

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

      <SettingsTargetsCard />
      <SettingsPatternCard />
      <DisplayPreferencesCard />
      <SettingsIntegrations initial={initial} />
    </main>
  );
}
