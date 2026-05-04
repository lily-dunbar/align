/**
 * Background Dexcom + Strava import for every connected account.
 *
 * Production: `vercel.json` runs this hourly (`0 * * * *`). Set `CRON_SECRET` on the project so
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` (see Vercel Cron docs). Other hosts: call
 * `GET` or `POST` on the same path with that header or `x-cron-secret`.
 *
 * Note: Vercel Hobby allows at most one cron invocation per day; hourly schedules need Pro (or an
 * external scheduler hitting this URL).
 */
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { dexcomTokens, glucoseReadings, stravaTokens } from "@/db/schema";
import { syncDexcomGlucoseReadings } from "@/lib/dexcom/client";
import { isPydexcomShareConfigured } from "@/lib/dexcom/share-sync";
import { syncShortcutsStepsFromDiskToDb } from "@/lib/integrations/health/readShortcutsSteps";
import { syncStravaActivities } from "@/lib/strava/client";

export const dynamic = "force-dynamic";

/** Allow long runs when many accounts exist (override on your host if supported). */
export const maxDuration = 300;

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  const bearer =
    auth && auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : null;
  const header = request.headers.get("x-cron-secret")?.trim();
  return bearer === secret || header === secret;
}

function parseIdList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
}

/**
 * Users who should receive Dexcom Share data on cron (same CGM duplicated per user, matching manual sync).
 */
async function dexcomShareFanoutUserIds(): Promise<string[]> {
  const explicit = parseIdList(process.env.CRON_DEXCOM_SHARE_USER_IDS);
  if (explicit.length) return explicit;

  const withDexcomReadings = await db
    .select({ userId: glucoseReadings.userId })
    .from(glucoseReadings)
    .where(eq(glucoseReadings.source, "dexcom"))
    .groupBy(glucoseReadings.userId);
  const ids = withDexcomReadings.map((r) => r.userId).filter(Boolean);
  return [...new Set(ids)];
}

type ItemOk = { userId: string; ok: true; [k: string]: unknown };
type ItemErr = { userId: string; ok: false; error: string };
type SyncItem = ItemOk | ItemErr;

export async function GET(request: Request) {
  return runCron(request);
}

export async function POST(request: Request) {
  return runCron(request);
}

async function runCron(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dexcom: SyncItem[] = [];
  const strava: SyncItem[] = [];
  let shortcutsFile:
    | { ok: true; [k: string]: unknown }
    | { ok: false; error: string }
    | undefined;

  const share = isPydexcomShareConfigured();

  if (share) {
    const userIds = await dexcomShareFanoutUserIds();
    if (userIds.length === 0) {
      dexcom.push({
        userId: "_none_",
        ok: false,
        error:
          "Dexcom Share is on but no fan-out users: set CRON_DEXCOM_SHARE_USER_IDS (comma-separated Clerk user ids) or import glucose once per user.",
      });
    } else {
      for (const userId of userIds) {
        try {
          const r = await syncDexcomGlucoseReadings(userId, { lookbackDays: 30 });
          dexcom.push({ userId, ok: true, ...r });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          dexcom.push({ userId, ok: false, error: msg });
        }
      }
    }
  } else {
    const rows = await db.select({ userId: dexcomTokens.userId }).from(dexcomTokens);
    for (const { userId } of rows) {
      try {
        const r = await syncDexcomGlucoseReadings(userId);
        dexcom.push({ userId, ok: true, ...r });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        dexcom.push({ userId, ok: false, error: msg });
      }
    }
  }

  const stravaRows = await db.select({ userId: stravaTokens.userId }).from(stravaTokens);
  for (const { userId } of stravaRows) {
    try {
      const r = await syncStravaActivities(userId);
      strava.push({ userId, ok: true, ...r });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      strava.push({ userId, ok: false, error: msg });
    }
  }

  if (process.env.CRON_SYNC_SHORTCUTS_FILE === "true") {
    const userId = process.env.CRON_SHORTCUTS_FILE_USER_ID?.trim();
    if (!userId) {
      shortcutsFile = {
        ok: false,
        error:
          "CRON_SYNC_SHORTCUTS_FILE=true requires CRON_SHORTCUTS_FILE_USER_ID (Clerk user id). Skipped.",
      };
    } else {
      try {
        const r = await syncShortcutsStepsFromDiskToDb(userId);
        if (r.ok) shortcutsFile = r;
        else shortcutsFile = { ok: false, error: r.error };
      } catch (e) {
        shortcutsFile = {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }
  }

  const dexcomOk = dexcom.filter((x) => x.ok).length;
  const stravaOk = strava.filter((x) => x.ok).length;

  return NextResponse.json({
    ok: true,
    at: new Date().toISOString(),
    dexcom: {
      mode: share ? "share" : "oauth",
      users: dexcom.length,
      succeeded: dexcomOk,
      results: dexcom,
    },
    strava: {
      users: strava.length,
      succeeded: stravaOk,
      results: strava,
    },
    shortcutsFile: shortcutsFile ?? { skipped: true },
  });
}
