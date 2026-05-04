import { NextRequest, NextResponse } from "next/server";

import { getStepsIngestSharedSecret } from "@/lib/steps/ingest-auth";

function parseBearer(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice("Bearer ".length);
}

/**
 * Internal / legacy endpoint. Shortcut ingest must use POST `/api/ingest/steps/:token` — see Settings.
 */
export async function POST(req: NextRequest) {
  const shared = getStepsIngestSharedSecret();
  const shortcutHeader = req.headers.get("x-shortcut-secret");
  const bearer = parseBearer(req);

  if (
    shared &&
    (bearer === shared || shortcutHeader === shared)
  ) {
    return NextResponse.json(
      {
        error:
          "Wrong endpoint: URL must include your personal ingest token after /api/ingest/steps/",
        hint:
          "While signed in, open Settings → Integrations (or GET /api/ingest/steps/token). Use the full `ingestUrl` such as https://…/api/ingest/steps/st_…. The path cannot end at /api/ingest/steps only.",
      },
      { status: 400 },
    );
  }

  const expected = process.env.INTERNAL_API_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "INTERNAL_API_SECRET is not configured" },
      { status: 500 },
    );
  }

  if (bearer !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await req.json();
    if (!Array.isArray(data)) {
      return NextResponse.json({ error: "Body must be a JSON array" }, { status: 400 });
    }
    return NextResponse.json({
      status: "accepted",
      count: data.length,
      notice: "This route does not persist steps. Implement your pipeline or use /api/ingest/steps/:token.",
    }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
