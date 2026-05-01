import { and, count, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { activities, stravaTokens } from "@/db/schema";
import { getValidStravaAccessToken } from "@/lib/strava/client";
import { getStravaApiBaseUrl } from "@/lib/strava/oauth";

type RawStravaActivity = {
  id?: number;
  name?: string;
  type?: string;
  sport_type?: string;
  start_date?: string;
  distance?: number;
  elapsed_time?: number;
  moving_time?: number;
};

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tokenRow = await db.query.stravaTokens.findFirst({
    where: eq(stravaTokens.userId, userId),
  });

  if (!tokenRow) {
    return NextResponse.json(
      {
        userId,
        connected: false,
        error: "No strava_tokens row found. Connect Strava first.",
      },
      { status: 404 },
    );
  }

  const [{ totalInDb }] = await db
    .select({ totalInDb: count() })
    .from(activities)
    .where(and(eq(activities.userId, userId), eq(activities.provider, "strava")));

  const accessToken = await getValidStravaAccessToken(userId);
  const apiBase = getStravaApiBaseUrl().replace(/\/$/, "");

  const activitiesUrl = new URL(`${apiBase}/athlete/activities`);
  activitiesUrl.searchParams.set("per_page", "10");
  activitiesUrl.searchParams.set("page", "1");
  activitiesUrl.searchParams.set("after", "1");

  const meUrl = new URL(`${apiBase}/athlete`);

  const [meResp, activitiesResp] = await Promise.all([
    fetch(meUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    }),
    fetch(activitiesUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    }),
  ]);

  const meText = await meResp.text();
  const activitiesText = await activitiesResp.text();

  let meJson: unknown = null;
  let activitiesJson: unknown = null;

  try {
    meJson = JSON.parse(meText);
  } catch {
    meJson = meText;
  }

  try {
    activitiesJson = JSON.parse(activitiesText);
  } catch {
    activitiesJson = activitiesText;
  }

  const activityList = Array.isArray(activitiesJson)
    ? (activitiesJson as RawStravaActivity[])
    : [];

  return NextResponse.json({
    appUserId: userId,
    stravaToken: {
      athleteId: tokenRow.athleteId,
      scope: tokenRow.scope,
      tokenType: tokenRow.tokenType,
      expiresAt: tokenRow.expiresAt,
      updatedAt: tokenRow.updatedAt,
    },
    database: {
      totalStravaActivities: Number(totalInDb ?? 0),
    },
    stravaApi: {
      athleteStatus: meResp.status,
      athleteSummary:
        meJson && typeof meJson === "object"
          ? {
              id: (meJson as Record<string, unknown>).id,
              username: (meJson as Record<string, unknown>).username,
              firstname: (meJson as Record<string, unknown>).firstname,
              lastname: (meJson as Record<string, unknown>).lastname,
            }
          : meJson,
      activitiesStatus: activitiesResp.status,
      activitiesReturned: activityList.length,
      activitiesSample: activityList.slice(0, 5).map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        sport_type: a.sport_type,
        start_date: a.start_date,
        distance: a.distance,
        elapsed_time: a.elapsed_time,
        moving_time: a.moving_time,
      })),
      activitiesRawPreview:
        activityList.length === 0
          ? activitiesJson
          : "Omitted because activitiesSample is populated",
    },
  });
}
