import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { stravaTokens, user } from "@/db/schema";
import {
  getStravaRedirectUri,
  getStravaTokenUrl,
  verifyStravaState,
} from "@/lib/strava/oauth";
import { sanitizeOAuthReturnTo } from "@/lib/oauth-return-to";
import { getPublicAppBaseUrl } from "@/lib/public-app-base-url";

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

function redirectWithStravaQuery(
  appBase: string,
  path: string,
  params: Record<string, string>,
) {
  const out = new URL(path, appBase);
  for (const [k, v] of Object.entries(params)) {
    out.searchParams.set(k, v);
  }
  return NextResponse.redirect(out);
}

function pathFromStravaState(stateParam: string | null): string | undefined {
  if (!stateParam) return undefined;
  try {
    const parsed = verifyStravaState(stateParam);
    return sanitizeOAuthReturnTo(parsed.returnTo) ?? "/";
  } catch {
    return undefined;
  }
}

export async function GET(request: NextRequest) {
  const appBase = getPublicAppBaseUrl();

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const authError = url.searchParams.get("error");

  if (authError) {
    const path = pathFromStravaState(state) ?? "/";
    return redirectWithStravaQuery(appBase, path, { strava_error: authError });
  }

  if (!code || !state) {
    const path = pathFromStravaState(state) ?? "/";
    return redirectWithStravaQuery(appBase, path, {
      strava_error: "missing_code_or_state",
    });
  }

  let parsedState;
  try {
    parsedState = verifyStravaState(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_state";
    return redirectWithStravaQuery(appBase, "/", { strava_error: message });
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const path = sanitizeOAuthReturnTo(parsedState.returnTo) ?? "/";
    return redirectWithStravaQuery(appBase, path, {
      strava_error: "missing_client_config",
    });
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
    const path = sanitizeOAuthReturnTo(parsedState.returnTo) ?? "/";
    return redirectWithStravaQuery(appBase, path, {
      strava_error: "token_exchange_failed",
      strava_details: details.slice(0, 400),
    });
  }

  const tokenJson = (await tokenResp.json()) as StravaTokenResponse;
  const expiresAt = tokenJson.expires_at
    ? new Date(tokenJson.expires_at * 1000)
    : tokenJson.expires_in
      ? new Date(Date.now() + tokenJson.expires_in * 1000)
      : null;

  try {
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
  } catch {
    const path = sanitizeOAuthReturnTo(parsedState.returnTo) ?? "/";
    return redirectWithStravaQuery(appBase, path, {
      strava_error: "db_unavailable",
    });
  }

  const pathOk = sanitizeOAuthReturnTo(parsedState.returnTo) ?? "/";
  return redirectWithStravaQuery(appBase, pathOk, { strava: "connected" });
}
