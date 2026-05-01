import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  createStravaState,
  getStravaAuthorizeUrl,
  getStravaRedirectUri,
} from "@/lib/strava/oauth";

export async function GET(request: Request) {
  const { userId } = await auth();
  const appBase = process.env.AUTH_URL ?? "http://localhost:4000";

  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", appBase));
  }

  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get("return_to");

  const clientId = process.env.STRAVA_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(new URL("/?strava_error=missing_client_id", appBase));
  }

  const state = createStravaState(userId, returnTo);
  const authorizeUrl = new URL(getStravaAuthorizeUrl());
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", getStravaRedirectUri());
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", process.env.STRAVA_SCOPE ?? "activity:read_all");
  authorizeUrl.searchParams.set("approval_prompt", "auto");
  authorizeUrl.searchParams.set("state", state);

  return NextResponse.redirect(authorizeUrl);
}
