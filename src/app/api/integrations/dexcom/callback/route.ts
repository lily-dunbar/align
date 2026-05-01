import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { dexcomTokens, user } from "@/db/schema";
import {
  getDexcomRedirectUri,
  getDexcomTokenUrl,
  verifyDexcomState,
} from "@/lib/dexcom/oauth";
import { sanitizeOAuthReturnTo } from "@/lib/oauth-return-to";

type DexcomTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

function redirectWithDexcomQuery(
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

function pathFromDexcomState(stateParam: string | null): string | undefined {
  if (!stateParam) return undefined;
  try {
    const parsed = verifyDexcomState(stateParam);
    return sanitizeOAuthReturnTo(parsed.returnTo) ?? "/";
  } catch {
    return undefined;
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const authError = url.searchParams.get("error");

  const appBase = process.env.AUTH_URL ?? "http://localhost:4000";
  if (authError) {
    const path = pathFromDexcomState(state) ?? "/";
    return redirectWithDexcomQuery(appBase, path, { dexcom_error: authError });
  }

  if (!code || !state) {
    const path = pathFromDexcomState(state) ?? "/";
    return redirectWithDexcomQuery(appBase, path, {
      dexcom_error: "missing_code_or_state",
    });
  }

  let parsedState;
  try {
    parsedState = verifyDexcomState(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid state";
    return redirectWithDexcomQuery(appBase, "/", { dexcom_error: message });
  }

  const clientId = process.env.DEXCOM_CLIENT_ID;
  const clientSecret = process.env.DEXCOM_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const path = sanitizeOAuthReturnTo(parsedState.returnTo) ?? "/";
    return redirectWithDexcomQuery(appBase, path, {
      dexcom_error: "missing_dexcom_client_config",
    });
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getDexcomRedirectUri(),
  });

  const tokenResp = await fetch(getDexcomTokenUrl(), {
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
    return redirectWithDexcomQuery(appBase, path, {
      dexcom_error: "token_exchange_failed",
      dexcom_details: details.slice(0, 400),
    });
  }

  const tokenJson = (await tokenResp.json()) as DexcomTokenResponse;
  const expiresAt = tokenJson.expires_in
    ? new Date(Date.now() + tokenJson.expires_in * 1000)
    : null;

  // Clerk owns identity; create a matching local user row on demand
  // so Dexcom token FK constraints can reference it safely.
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

  const existing = await db.query.dexcomTokens.findFirst({
    where: eq(dexcomTokens.userId, parsedState.userId),
    columns: { userId: true },
  });

  if (existing) {
    await db
      .update(dexcomTokens)
      .set({
        accessToken: tokenJson.access_token,
        refreshToken: tokenJson.refresh_token ?? null,
        expiresAt,
        scope: tokenJson.scope ?? null,
        tokenType: tokenJson.token_type ?? null,
        updatedAt: new Date(),
      })
      .where(eq(dexcomTokens.userId, parsedState.userId));
  } else {
    await db.insert(dexcomTokens).values({
      userId: parsedState.userId,
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token ?? null,
      expiresAt,
      scope: tokenJson.scope ?? null,
      tokenType: tokenJson.token_type ?? null,
    });
  }

  const pathOk = sanitizeOAuthReturnTo(parsedState.returnTo) ?? "/";
  return redirectWithDexcomQuery(appBase, pathOk, { dexcom: "connected" });
}
