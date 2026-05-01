import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  getOrCreateStepIngestToken,
  regenerateStepIngestToken,
} from "@/lib/steps/token-store";

function appBaseUrl() {
  return (process.env.AUTH_URL ?? "http://localhost:4000").replace(/\/$/, "");
}

function buildResponse(userId: string, token: string) {
  const appBase = appBaseUrl();
  return {
    userId,
    stepIngestToken: token,
    ingestUrl: `${appBase}/api/ingest/steps/${token}`,
    notes: [
      "Use this URL in Apple Shortcuts 'Get Contents of URL'.",
      "Set X-Shortcut-Secret to your STEPS_INGEST_SECRET.",
      "POST JSON body with either { timestamp, steps } or { samples: [{ timestamp, steps }, ...] }.",
    ],
  };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = await getOrCreateStepIngestToken(userId);
  return NextResponse.json(buildResponse(userId, token));
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = await regenerateStepIngestToken(userId);
  return NextResponse.json(buildResponse(userId, token));
}
