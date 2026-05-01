import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { stravaTokens, user } from "@/db/schema";
import {
  getStravaRedirectUri,
  getStravaTokenUrl,
  verifyStravaState,
} from "@/lib/strava/oauth";

type StravaTokenResponse = {
  token_type: string;
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  scope?: string;
  athlete?: {
    id?: number | string;
  };
};

export async function GET(request: NextRequest) {
  const appBase = process.env.AUTH_URL ?? "http://localhost:4000";

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const authError = url.searchParams.get("error");

  if (authError) {
    return NextResponse.redirect(
      new URL(`/?strava_error=${encodeURIComponent(authError)}`, appBase),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/?strava_error=missing_code_or_state", appBase));
  }

  let parsedState;
  try {
    parsedState = verifyStravaState(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_state";
    return NextResponse.redirect(
      new URL(`/?strava_error=${encodeURIComponent(message)}`, appBase),
    );
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/?strava_error=missing_client_config", appBase));
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: getStravaRedirectUri(),
  });

  const tokenResp = await fetch(getStravaTokenUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  if (!tokenResp.ok) {
    const details = await tokenResp.text();
    return NextResponse.redirect(
      new URL(
        `/?strava_error=token_exchange_failed&strava_details=${encodeURIComponent(details.slice(0, 400))}`,
        appBase,
      ),
    );
  }

  const tokenJson = (await tokenResp.json()) as StravaTokenResponse;
  const expiresAt = tokenJson.expires_at
    ? new Date(tokenJson.expires_at * 1000)
    : tokenJson.expires_in
      ? new Date(Date.now() + tokenJson.expires_in * 1000)
      : null;

  await db
    .insert(user)
    .values({
      id: parsedState.userId,
      name: "Clerk User",
      email: null,
      emailVerified: null,
      image: null,
    })
    .onConflictDoNothing({ target: user.id });

  const existing = await db.query.stravaTokens.findFirst({
    where: eq(stravaTokens.userId, parsedState.userId),
    columns: { userId: true },
  });

  const values = {
    athleteId: tokenJson.athlete?.id ? String(tokenJson.athlete.id) : null,
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.refresh_token ?? null,
    expiresAt,
    scope: tokenJson.scope ?? null,
    tokenType: tokenJson.token_type ?? null,
  };

  if (existing) {
    await db
      .update(stravaTokens)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(stravaTokens.userId, parsedState.userId));
  } else {
    await db.insert(stravaTokens).values({ userId: parsedState.userId, ...values });
  }

  return NextResponse.redirect(new URL("/?strava=connected", appBase));
}
