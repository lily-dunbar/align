import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { syncDexcomGlucoseReadings } from "@/lib/dexcom/client";
import { updateUserPreferences } from "@/lib/user-display-preferences";
import { sanitizeOAuthReturnTo } from "@/lib/oauth-return-to";
import { getPublicAppBaseUrl } from "@/lib/public-app-base-url";

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
      new URL("/?dexcom_sync=error&dexcom_sync_message=unauthorized", appBaseUrl()),
    );
  }

  let shareOptions: { lookbackDays?: number } | undefined;
  let dismissDexcomBackfillPrompt = false;
  try {
    const ct = request.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const body = (await request.json()) as {
        lookbackDays?: unknown;
        dismissDexcomBackfillPrompt?: unknown;
      };
      if (body && typeof body.lookbackDays === "number" && Number.isFinite(body.lookbackDays)) {
        shareOptions = { lookbackDays: body.lookbackDays };
      }
      if (body?.dismissDexcomBackfillPrompt === true) {
        dismissDexcomBackfillPrompt = true;
      }
    }
  } catch {
    shareOptions = undefined;
  }

  try {
    const result = await syncDexcomGlucoseReadings(userId, shareOptions);
    if (dismissDexcomBackfillPrompt) {
      await updateUserPreferences(userId, { dexcomBackfill90PromptDismissed: true });
    }
    if (wantsJson) {
      return NextResponse.json({ ok: true, ...result });
    }
    const basePath = sanitizeOAuthReturnTo(url.searchParams.get("return_to")) ?? "/";
    const redirectUrl = new URL(basePath, appBaseUrl());
    redirectUrl.searchParams.set("dexcom_sync", "ok");
    redirectUrl.searchParams.set("fetched", String(result.fetched));
    redirectUrl.searchParams.set("inserted", String(result.inserted));
    redirectUrl.searchParams.set("updated", String(result.updated));
    redirectUrl.searchParams.set("unchanged", String(result.unchanged ?? 0));
    redirectUrl.searchParams.set("first_sync", String(result.firstSync));
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    if (wantsJson) {
      return NextResponse.json({ error: message }, { status: 502 });
    }
    const basePath = sanitizeOAuthReturnTo(url.searchParams.get("return_to")) ?? "/";
    const redirectUrl = new URL(basePath, appBaseUrl());
    redirectUrl.searchParams.set("dexcom_sync", "error");
    redirectUrl.searchParams.set("dexcom_sync_message", message.slice(0, 300));
    return NextResponse.redirect(redirectUrl);
  }
}

export async function GET(request: Request) {
  return POST(request);
}
