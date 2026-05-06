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
/** Default rolling window for `/athlete/activities` (Strava `after` / `before` epoch seconds). */
const DEFAULT_STRAVA_SYNC_LOOKBACK_DAYS = 30;

function stravaSyncLookbackDays(): number {
  const raw = process.env.STRAVA_SYNC_LOOKBACK_DAYS?.trim();
  if (!raw) return DEFAULT_STRAVA_SYNC_LOOKBACK_DAYS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_STRAVA_SYNC_LOOKBACK_DAYS;
  return Math.min(365, Math.floor(n));
}

function clampStravaLookbackDays(days: number): number {
  if (!Number.isFinite(days)) return DEFAULT_STRAVA_SYNC_LOOKBACK_DAYS;
  return Math.min(365, Math.max(1, Math.floor(days)));
}

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

function intEq(a: number | null, b: number | null) {
  return (a ?? null) === (b ?? null);
}

function strEq(a: string | null, b: string | null) {
  return (a ?? null) === (b ?? null);
}

function dateEq(a: Date | null, b: Date | null) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.getTime() === b.getTime();
}

type ActivityUpsertValues = {
  userId: string;
  provider: "strava";
  providerActivityId: string;
  name: string | null;
  activityType: string | null;
  sportType: string | null;
  startAt: Date;
  endAt: Date | null;
  durationSec: number | null;
  distanceMeters: number | null;
  movingTimeSec: number | null;
  elapsedTimeSec: number | null;
  totalElevationGainMeters: number | null;
  averageHeartrate: number | null;
  maxHeartrate: number | null;
  averageWatts: number | null;
  kilojoules: number | null;
  calories: number | null;
  sourcePayload: string;
};

type ActivityCompareRow = Pick<
  ActivityUpsertValues,
  | "name"
  | "activityType"
  | "sportType"
  | "startAt"
  | "endAt"
  | "durationSec"
  | "distanceMeters"
  | "movingTimeSec"
  | "elapsedTimeSec"
  | "totalElevationGainMeters"
  | "averageHeartrate"
  | "maxHeartrate"
  | "averageWatts"
  | "kilojoules"
  | "calories"
> & { sourcePayload: string | null };

function stravaActivityUnchanged(existing: ActivityCompareRow, next: ActivityUpsertValues) {
  return (
    strEq(existing.name, next.name) &&
    strEq(existing.activityType, next.activityType) &&
    strEq(existing.sportType, next.sportType) &&
    dateEq(existing.startAt, next.startAt) &&
    dateEq(existing.endAt, next.endAt) &&
    intEq(existing.durationSec, next.durationSec) &&
    intEq(existing.distanceMeters, next.distanceMeters) &&
    intEq(existing.movingTimeSec, next.movingTimeSec) &&
    intEq(existing.elapsedTimeSec, next.elapsedTimeSec) &&
    intEq(existing.totalElevationGainMeters, next.totalElevationGainMeters) &&
    intEq(existing.averageHeartrate, next.averageHeartrate) &&
    intEq(existing.maxHeartrate, next.maxHeartrate) &&
    intEq(existing.averageWatts, next.averageWatts) &&
    intEq(existing.kilojoules, next.kilojoules) &&
    intEq(existing.calories, next.calories) &&
    (existing.sourcePayload ?? "") === next.sourcePayload
  );
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

export async function syncStravaActivities(userId: string, lookbackDaysOverride?: number) {
  const latest = await db.query.activities.findFirst({
    where: and(eq(activities.userId, userId), eq(activities.provider, "strava")),
    orderBy: [desc(activities.startAt)],
    columns: { startAt: true },
  });

  const now = new Date();
  const lookbackDays =
    lookbackDaysOverride != null
      ? clampStravaLookbackDays(lookbackDaysOverride)
      : stravaSyncLookbackDays();
  const windowStart = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const afterEpoch = epochSec(windowStart);
  const beforeEpoch = epochSec(now);

  const accessToken = await getValidStravaAccessToken(userId);

  let page = 1;
  let fetched = 0;
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  while (page <= MAX_SYNC_PAGES) {
    const pageRows = await fetchStravaActivities(accessToken, {
      after: afterEpoch,
      before: beforeEpoch,
      page,
      perPage: DEFAULT_PAGE_SIZE,
    });

    if (!pageRows.length) break;

    for (const activity of pageRows) {
      const providerActivityId = String(activity.id);
      const startAt = parseDate(activity.start_date);
      if (!providerActivityId || !startAt) continue;

      const elapsedTime = asInt(activity.elapsed_time);
      const movingTime = asInt(activity.moving_time);
      const endAt = elapsedTime ? new Date(startAt.getTime() + elapsedTime * 1000) : null;

      const values: ActivityUpsertValues = {
        userId,
        provider: "strava",
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

      const existing = await db.query.activities.findFirst({
        where: and(
          eq(activities.userId, userId),
          eq(activities.provider, "strava"),
          eq(activities.providerActivityId, providerActivityId),
        ),
        columns: {
          id: true,
          name: true,
          activityType: true,
          sportType: true,
          startAt: true,
          endAt: true,
          durationSec: true,
          distanceMeters: true,
          movingTimeSec: true,
          elapsedTimeSec: true,
          totalElevationGainMeters: true,
          averageHeartrate: true,
          maxHeartrate: true,
          averageWatts: true,
          kilojoules: true,
          calories: true,
          sourcePayload: true,
        },
      });

      if (existing) {
        if (stravaActivityUnchanged(existing, values)) {
          unchanged += 1;
        } else {
          await db
            .update(activities)
            .set({
              ...values,
              updatedAt: new Date(),
            })
            .where(eq(activities.id, existing.id));
          updated += 1;
        }
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
    unchanged,
    firstSync: !latest,
    lookbackDays,
    windowStart: windowStart.toISOString(),
    endDate: now.toISOString(),
  };
}
