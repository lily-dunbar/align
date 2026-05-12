import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  createStravaState,
  getStravaAuthorizeUrl,
  getStravaRedirectUri,
} from "@/lib/strava/oauth";
import { sanitizeOAuthReturnTo } from "@/lib/oauth-return-to";
import { getPublicAppBaseUrl } from "@/lib/public-app-base-url";

export async function GET(request: Request) {
  const { userId } = await auth();
  const appBase = getPublicAppBaseUrl();

  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", appBase));
  }

  const { searchParams } = new URL(request.url);
  const returnTo = sanitizeOAuthReturnTo(searchParams.get("return_to")) ?? "/";

  const clientId = process.env.STRAVA_CLIENT_ID;
  if (!clientId) {
    const out = new URL(returnTo, appBase);
    out.searchParams.set("strava_error", "missing_client_id");
    return NextResponse.redirect(out);
  }

  let state: string;
  try {
    state = createStravaState(userId, returnTo);
  } catch (error) {
    const out = new URL(returnTo, appBase);
    out.searchParams.set("strava_error", "state_setup_failed");
    if (error instanceof Error) {
      out.searchParams.set("strava_details", error.message.slice(0, 180));
    }
    return NextResponse.redirect(out);
  }
  const authorizeUrl = new URL(getStravaAuthorizeUrl());
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", getStravaRedirectUri());
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", process.env.STRAVA_SCOPE ?? "activity:read_all");
  authorizeUrl.searchParams.set("state", state);

  return NextResponse.redirect(authorizeUrl);
}
