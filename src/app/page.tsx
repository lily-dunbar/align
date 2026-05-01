import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";

import { db } from "@/db";
import { activities, glucoseReadings } from "@/db/schema";
import { SyncDexcomButton } from "@/components/sync-dexcom-button";
import { SyncStravaButton } from "@/components/sync-strava-button";

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
  const dexcomSync = readParam(params, "dexcom_sync");
  const inserted = readParam(params, "inserted");
  const updated = readParam(params, "updated");
  const fetched = readParam(params, "fetched");
  const syncMessage = readParam(params, "dexcom_sync_message");
  const stravaSync = readParam(params, "strava_sync");
  const stravaFetched = readParam(params, "strava_fetched");
  const stravaInserted = readParam(params, "strava_inserted");
  const stravaUpdated = readParam(params, "strava_updated");
  const stravaSyncMessage = readParam(params, "strava_sync_message");

  const latestDexcomSync = userId
    ? await db.query.glucoseReadings.findFirst({
        where: eq(glucoseReadings.userId, userId),
        orderBy: [desc(glucoseReadings.updatedAt)],
        columns: {
          updatedAt: true,
        },
      })
    : null;
  const latestStravaSync = userId
    ? await db.query.activities.findFirst({
        where: and(eq(activities.userId, userId), eq(activities.provider, "strava")),
        orderBy: [desc(activities.updatedAt)],
        columns: {
          updatedAt: true,
        },
      })
    : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-semibold">Align</h1>
      <p className="text-zinc-600">
        Metabolic intelligence for daily diabetes decisions.
      </p>

      {userId ? (
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-500">Signed in</span>
          <UserButton />
        </div>
      ) : (
        <Link
          href="/auth/signin"
          className="rounded bg-zinc-900 px-4 py-2 text-white"
        >
          Sign in with email
        </Link>
      )}

      {dexcomSync === "ok" ? (
        <p className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Dexcom sync complete. Fetched {fetched ?? "0"}, inserted{" "}
          {inserted ?? "0"}, updated {updated ?? "0"} readings.
        </p>
      ) : null}
      {dexcomSync === "error" ? (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          Dexcom sync failed: {syncMessage ?? "Unknown error"}
        </p>
      ) : null}
      {stravaSync === "ok" ? (
        <p className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Strava sync complete. Fetched {stravaFetched ?? "0"}, inserted{" "}
          {stravaInserted ?? "0"}, updated {stravaUpdated ?? "0"} activities.
        </p>
      ) : null}
      {stravaSync === "error" ? (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          Strava sync failed: {stravaSyncMessage ?? "Unknown error"}
        </p>
      ) : null}
      {userId ? (
        <div className="space-y-1 text-xs text-zinc-500">
          <p>
            Dexcom last synced:{" "}
            {latestDexcomSync?.updatedAt
              ? latestDexcomSync.updatedAt.toLocaleString()
              : "Never"}
          </p>
          <p>
            Strava last synced:{" "}
            {latestStravaSync?.updatedAt
              ? latestStravaSync.updatedAt.toLocaleString()
              : "Never"}
          </p>
        </div>
      ) : null}

      {userId ? (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href="/api/integrations/dexcom/connect"
            className="rounded border px-4 py-2 text-sm"
          >
            Connect Dexcom
          </a>
          <SyncDexcomButton />
          <a
            href="/api/integrations/strava/connect"
            className="rounded border px-4 py-2 text-sm"
          >
            Connect Strava
          </a>
          <SyncStravaButton />
          <a
            href="/api/integrations/strava/debug"
            className="rounded border px-4 py-2 text-sm"
            target="_blank"
            rel="noreferrer"
          >
            Debug Strava data
          </a>
          <a
            href="/settings"
            className="rounded border px-4 py-2 text-sm"
          >
            Settings
          </a>
        </div>
      ) : null}
    </main>
  );
}
