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
      "Set X-Shortcut-Secret (or Authorization: Bearer) to the same value as STEPS_INGEST_SECRET, STEPS_TOKEN_SECRET, or AUTH_SECRET in .env.local.",
      "POST JSON body with either { timestamp, steps } or { samples: [{ timestamp, steps }, ...] }.",
    ],
  };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const token = await getOrCreateStepIngestToken(userId);
    return NextResponse.json(buildResponse(userId, token));
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const hint =
      raw.includes("step_ingest_tokens") || raw.includes("relation")
        ? "Database may be out of date — run npm run db:migrate and try again."
        : raw;
    console.error("[ingest/steps/token] GET failed:", error);
    return NextResponse.json({ error: hint }, { status: 500 });
  }
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const token = await regenerateStepIngestToken(userId);
    return NextResponse.json(buildResponse(userId, token));
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const hint =
      raw.includes("step_ingest_tokens") || raw.includes("relation")
        ? "Database may be out of date — run npm run db:migrate and try again."
        : raw;
    console.error("[ingest/steps/token] POST failed:", error);
    return NextResponse.json({ error: hint }, { status: 500 });
  }
}
