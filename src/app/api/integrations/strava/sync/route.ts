import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { sanitizeOAuthReturnTo } from "@/lib/oauth-return-to";
import { getPublicAppBaseUrl } from "@/lib/public-app-base-url";
import { syncStravaActivities } from "@/lib/strava/client";

function appBaseUrl() {
  return getPublicAppBaseUrl();
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const wantsJson = url.searchParams.get("format") === "json";
  const { userId } = await auth();

  if (!userId) {
    if (wantsJson) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(
      new URL("/?strava_sync=error&strava_sync_message=unauthorized", appBaseUrl()),
    );
  }

  try {
    const result = await syncStravaActivities(userId);

    if (wantsJson) {
      return NextResponse.json({ ok: true, ...result });
    }

    const basePath = sanitizeOAuthReturnTo(url.searchParams.get("return_to")) ?? "/";
    const redirectUrl = new URL(basePath, appBaseUrl());
    redirectUrl.searchParams.set("strava_sync", "ok");
    redirectUrl.searchParams.set("strava_fetched", String(result.fetched));
    redirectUrl.searchParams.set("strava_inserted", String(result.inserted));
    redirectUrl.searchParams.set("strava_updated", String(result.updated));
    redirectUrl.searchParams.set("strava_first_sync", String(result.firstSync));
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";

    if (wantsJson) {
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const basePath = sanitizeOAuthReturnTo(url.searchParams.get("return_to")) ?? "/";
    const redirectUrl = new URL(basePath, appBaseUrl());
    redirectUrl.searchParams.set("strava_sync", "error");
    redirectUrl.searchParams.set("strava_sync_message", message.slice(0, 300));
    return NextResponse.redirect(redirectUrl);
  }
}

export async function GET(request: Request) {
  return POST(request);
}
