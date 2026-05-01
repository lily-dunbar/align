import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { getPatternsFeatureJson } from "@/lib/patterns/feature-json";
import { parsePatternWindow } from "@/lib/patterns/window";
import { safeTimeZoneForPatterns } from "@/lib/patterns/safe-timezone";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const window = parsePatternWindow(url.searchParams.get("window") ?? undefined);
  const timeZone = safeTimeZoneForPatterns(url.searchParams.get("timeZone") ?? undefined);

  try {
    const json = await getPatternsFeatureJson(userId, window, timeZone);
    return NextResponse.json(json);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load patterns";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
