import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { activities, stravaTokens } from "@/db/schema";
import { getStravaApiBaseUrl, getStravaTokenUrl } from "@/lib/strava/oauth";

type StravaTokenResponse = {
  token_type: string;
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  scope?: string;
  athlete?: { id?: number | string };
};

type StravaActivity = {
  id: number | string;
  name?: string;
  type?: string;
  sport_type?: string;
  start_date?: string;
  moving_time?: number;
  elapsed_time?: number;
  distance?: number;
  total_elevation_gain?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  kilojoules?: number;
  calories?: number;
};

const REFRESH_SKEW_SEC = 60;
const DEFAULT_PAGE_SIZE = 100;
const MAX_SYNC_PAGES = 200;

function asInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }
  return null;
}

function parseDate(input?: string): Date | null {
  if (!input) return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

function epochSec(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

async function refreshStravaToken(userId: string) {
  const current = await db.query.stravaTokens.findFirst({
    where: eq(stravaTokens.userId, userId),
  });

  if (!current?.refreshToken) {
    throw new Error("No Strava refresh token found. Reconnect Strava.");
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET must be configured");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: current.refreshToken,
  });

  const resp = await fetch(getStravaTokenUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  if (!resp.ok) {
    const details = await resp.text();
    throw new Error(`Strava token refresh failed: ${details}`);
  }

  const json = (await resp.json()) as StravaTokenResponse;
  const expiresAt = json.expires_at
    ? new Date(json.expires_at * 1000)
    : json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : null;

  await db
    .update(stravaTokens)
    .set({
      athleteId: json.athlete?.id ? String(json.athlete.id) : current.athleteId,
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? current.refreshToken,
      expiresAt,
      scope: json.scope ?? current.scope,
      tokenType: json.token_type ?? current.tokenType,
      updatedAt: new Date(),
    })
    .where(eq(stravaTokens.userId, userId));

  return json.access_token;
}

export async function getValidStravaAccessToken(userId: string) {
  const token = await db.query.stravaTokens.findFirst({
    where: eq(stravaTokens.userId, userId),
  });

  if (!token?.accessToken) {
    throw new Error("No Strava token found. Connect Strava first.");
  }

  const expiresAtSec = token.expiresAt
    ? Math.floor(token.expiresAt.getTime() / 1000)
    : 0;
  const nowSec = Math.floor(Date.now() / 1000);
  if (expiresAtSec > nowSec + REFRESH_SKEW_SEC) {
    return token.accessToken;
  }

  return refreshStravaToken(userId);
}

async function fetchStravaActivities(
  accessToken: string,
  params: { after?: number; before?: number; page: number; perPage: number },
) {
  const url = new URL(`${getStravaApiBaseUrl().replace(/\/$/, "")}/athlete/activities`);
  if (params.after) url.searchParams.set("after", String(params.after));
  if (params.before) url.searchParams.set("before", String(params.before));
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("per_page", String(params.perPage));

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!resp.ok) {
    const details = await resp.text();
    throw new Error(`Strava activities fetch failed: ${details}`);
  }

  const payload = (await resp.json()) as unknown;
  return Array.isArray(payload) ? (payload as StravaActivity[]) : [];
}

export async function syncStravaActivities(userId: string) {
  const latest = await db.query.activities.findFirst({
    where: and(eq(activities.userId, userId), eq(activities.provider, "strava")),
    orderBy: [desc(activities.startAt)],
    columns: { startAt: true },
  });

  const now = new Date();
  const rollingSyncLookbackDays = 7;
  const start = latest?.startAt
    ? new Date(latest.startAt.getTime() - rollingSyncLookbackDays * 24 * 60 * 60 * 1000)
    : null;
  const afterEpoch = start ? epochSec(start) : 1;

  const accessToken = await getValidStravaAccessToken(userId);

  let page = 1;
  let fetched = 0;
  let inserted = 0;
  let updated = 0;

  while (page <= MAX_SYNC_PAGES) {
    const pageRows = await fetchStravaActivities(accessToken, {
      after: afterEpoch,
      before: epochSec(now),
      page,
      perPage: DEFAULT_PAGE_SIZE,
    });

    if (!pageRows.length) break;

    for (const activity of pageRows) {
      const providerActivityId = String(activity.id);
      const startAt = parseDate(activity.start_date);
      if (!providerActivityId || !startAt) continue;

      const existing = await db.query.activities.findFirst({
        where: and(
          eq(activities.userId, userId),
          eq(activities.provider, "strava"),
          eq(activities.providerActivityId, providerActivityId),
        ),
        columns: { id: true },
      });

      const elapsedTime = asInt(activity.elapsed_time);
      const movingTime = asInt(activity.moving_time);
      const endAt = elapsedTime ? new Date(startAt.getTime() + elapsedTime * 1000) : null;

      const values = {
        userId,
        provider: "strava" as const,
        providerActivityId,
        name: activity.name ?? null,
        activityType: activity.type ?? null,
        sportType: activity.sport_type ?? null,
        startAt,
        endAt,
        durationSec: elapsedTime,
        distanceMeters: asInt(activity.distance),
        movingTimeSec: movingTime,
        elapsedTimeSec: elapsedTime,
        totalElevationGainMeters: asInt(activity.total_elevation_gain),
        averageHeartrate: asInt(activity.average_heartrate),
        maxHeartrate: asInt(activity.max_heartrate),
        averageWatts: asInt(activity.average_watts),
        kilojoules: asInt(activity.kilojoules),
        calories: asInt(activity.calories),
        sourcePayload: JSON.stringify(activity),
      };

      if (existing) {
        await db
          .update(activities)
          .set({
            ...values,
            updatedAt: new Date(),
          })
          .where(eq(activities.id, existing.id));
        updated += 1;
      } else {
        await db.insert(activities).values(values);
        inserted += 1;
      }

      fetched += 1;
    }

    if (pageRows.length < DEFAULT_PAGE_SIZE) break;
    page += 1;
  }

  return {
    fetched,
    inserted,
    updated,
    firstSync: !latest,
    startDate: start?.toISOString() ?? null,
    endDate: now.toISOString(),
  };
}
