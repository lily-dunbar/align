import { and, desc, eq, gte } from "drizzle-orm";

import { db } from "@/db";
import { dexcomTokens, glucoseReadings } from "@/db/schema";
import { getDexcomTokenUrl } from "@/lib/dexcom/oauth";
import {
  isPydexcomShareConfigured,
  syncDexcomGlucoseReadingsFromShare,
} from "@/lib/dexcom/share-sync";

type DexcomTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

type DexcomEgvInput = {
  mgdl: number;
  observedAt: Date;
  trend: string | null;
  trendRate: number | null;
};

const REFRESH_SKEW_MS = 60_000;
const DEXCOM_MAX_RANGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function getDexcomApiBase() {
  return (
    process.env.DEXCOM_API_BASE_URL ??
    process.env.DEXCOM_DATA_BASE_URL ??
    "https://api.dexcom.com"
  );
}

function formatIsoNoMillis(date: Date) {
  // Dexcom expects YYYY-MM-DDThh:mm:ss (no milliseconds, no timezone suffix).
  return date.toISOString().slice(0, 19);
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseObservedAt(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(raw)
    ? `${raw}Z`
    : raw;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseEgvs(payload: unknown): DexcomEgvInput[] {
  const records = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? ((payload as { records?: unknown; egvs?: unknown }).records ??
        (payload as { egvs?: unknown }).egvs)
      : null;

  if (!Array.isArray(records)) return [];

  const out: DexcomEgvInput[] = [];
  for (const row of records) {
    if (!row || typeof row !== "object") continue;
    const source = row as Record<string, unknown>;

    const mgdl =
      coerceNumber(source.value) ??
      coerceNumber(source.mgdl) ??
      coerceNumber(source.Value);
    const observedAt =
      parseObservedAt(source.systemTime) ??
      parseObservedAt(source.displayTime) ??
      parseObservedAt(source.WT) ??
      parseObservedAt(source.DT);

    if (!mgdl || !observedAt) continue;

    const trend =
      (typeof source.trend === "string" ? source.trend : null) ??
      (typeof source.Trend === "string" ? source.Trend : null);

    const trendRate =
      coerceNumber(source.trendRate) ??
      coerceNumber(source.trend_rate) ??
      coerceNumber(source.TrendRate);

    out.push({
      mgdl: Math.round(mgdl),
      observedAt,
      trend,
      trendRate: trendRate === null ? null : Math.round(trendRate),
    });
  }

  return out;
}

async function refreshDexcomToken(userId: string) {
  const current = await db.query.dexcomTokens.findFirst({
    where: eq(dexcomTokens.userId, userId),
  });

  if (!current?.refreshToken) {
    throw new Error("No Dexcom refresh token found. Reconnect Dexcom.");
  }

  const clientId = process.env.DEXCOM_CLIENT_ID;
  const clientSecret = process.env.DEXCOM_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("DEXCOM_CLIENT_ID and DEXCOM_CLIENT_SECRET must be configured");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: current.refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const resp = await fetch(getDexcomTokenUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  if (!resp.ok) {
    const details = await resp.text();
    throw new Error(`Dexcom refresh failed: ${details}`);
  }

  const tokenJson = (await resp.json()) as DexcomTokenResponse;
  const expiresAt = tokenJson.expires_in
    ? new Date(Date.now() + tokenJson.expires_in * 1000)
    : null;

  await db
    .update(dexcomTokens)
    .set({
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token ?? current.refreshToken,
      expiresAt,
      scope: tokenJson.scope ?? current.scope,
      tokenType: tokenJson.token_type ?? current.tokenType,
      updatedAt: new Date(),
    })
    .where(eq(dexcomTokens.userId, userId));

  return {
    accessToken: tokenJson.access_token,
    expiresAt,
  };
}

export async function getValidDexcomAccessToken(userId: string) {
  const token = await db.query.dexcomTokens.findFirst({
    where: eq(dexcomTokens.userId, userId),
  });

  if (!token?.accessToken) {
    throw new Error("No Dexcom token found. Connect Dexcom first.");
  }

  const expiresAtMs = token.expiresAt?.getTime() ?? 0;
  const stillValid = expiresAtMs > Date.now() + REFRESH_SKEW_MS;
  if (stillValid) {
    return token.accessToken;
  }

  const refreshed = await refreshDexcomToken(userId);
  return refreshed.accessToken;
}

export async function syncDexcomGlucoseReadings(userId: string) {
  if (isPydexcomShareConfigured()) {
    return syncDexcomGlucoseReadingsFromShare(userId);
  }

  const newest = await db.query.glucoseReadings.findFirst({
    where: eq(glucoseReadings.userId, userId),
    orderBy: [desc(glucoseReadings.observedAt)],
    columns: { observedAt: true },
  });

  const now = new Date();
  const defaultLookbackDays = 1;
  const firstSyncLookbackDays = 90;

  const start = newest?.observedAt
    ? new Date(newest.observedAt.getTime() - defaultLookbackDays * 24 * 60 * 60 * 1000)
    : new Date(now.getTime() - firstSyncLookbackDays * 24 * 60 * 60 * 1000);

  const accessToken = await getValidDexcomAccessToken(userId);

  const egvUrl =
    process.env.DEXCOM_EGVS_URL ??
    `${getDexcomApiBase().replace(/\/$/, "")}/v3/users/self/egvs`;

  const egvs: DexcomEgvInput[] = [];
  let cursor = start;
  while (cursor < now) {
    const chunkEnd = new Date(
      Math.min(
        now.getTime(),
        cursor.getTime() + DEXCOM_MAX_RANGE_DAYS * DAY_MS - 1000,
      ),
    );

    const requestUrl = new URL(egvUrl);
    requestUrl.searchParams.set("startDate", formatIsoNoMillis(cursor));
    requestUrl.searchParams.set("endDate", formatIsoNoMillis(chunkEnd));

    const resp = await fetch(requestUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!resp.ok) {
      const details = await resp.text();
      throw new Error(`Dexcom EGV sync failed: ${details}`);
    }

    const payload = await resp.json();
    egvs.push(...parseEgvs(payload));
    cursor = new Date(chunkEnd.getTime() + 1000);
  }

  let inserted = 0;
  let updated = 0;

  for (const egv of egvs) {
    const existing = await db.query.glucoseReadings.findFirst({
      where: and(
        eq(glucoseReadings.userId, userId),
        eq(glucoseReadings.observedAt, egv.observedAt),
      ),
      columns: { id: true },
    });

    if (existing) {
      await db
        .update(glucoseReadings)
        .set({
          mgdl: egv.mgdl,
          trend: egv.trend,
          trendRate: egv.trendRate,
          updatedAt: new Date(),
        })
        .where(eq(glucoseReadings.id, existing.id));
      updated += 1;
    } else {
      await db.insert(glucoseReadings).values({
        userId,
        observedAt: egv.observedAt,
        mgdl: egv.mgdl,
        trend: egv.trend,
        trendRate: egv.trendRate,
        source: "dexcom",
      });
      inserted += 1;
    }
  }

  return {
    fetched: egvs.length,
    inserted,
    updated,
    startDate: formatIsoNoMillis(start),
    endDate: formatIsoNoMillis(now),
    firstSync: !newest,
  };
}

export async function getLatestGlucoseReadings(userId: string, limit = 24) {
  return db.query.glucoseReadings.findMany({
    where: eq(glucoseReadings.userId, userId),
    orderBy: [desc(glucoseReadings.observedAt)],
    limit,
  });
}

export async function getGlucoseReadingsSince(userId: string, since: Date) {
  return db.query.glucoseReadings.findMany({
    where: and(eq(glucoseReadings.userId, userId), gte(glucoseReadings.observedAt, since)),
    orderBy: [desc(glucoseReadings.observedAt)],
  });
}
