import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { createStepIngestToken } from "@/lib/steps/ingest-token";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = createStepIngestToken(userId);
  const appBase = process.env.AUTH_URL ?? "http://localhost:4000";

  return NextResponse.json({
    userId,
    stepIngestToken: token,
    ingestUrl: `${appBase.replace(/\/$/, "")}/api/ingest/steps/${token}`,
    notes: [
      "Use this URL in Apple Shortcuts 'Get Contents of URL'.",
      "Set Authorization header to Bearer <STEPS_INGEST_SECRET>.",
      "POST JSON body with either { timestamp, steps } or { samples: [{ timestamp, steps }, ...] }.",
    ],
  });
}
