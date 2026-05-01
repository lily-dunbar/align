import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { hourlySteps, user } from "@/db/schema";
import { verifyStepIngestToken } from "@/lib/steps/ingest-token";

type StepSampleInput = {
  timestamp: string;
  steps: number;
};

function getRequiredIngestSecret() {
  const secret = process.env.STEPS_INGEST_SECRET;
  if (!secret) {
    throw new Error("STEPS_INGEST_SECRET is not configured");
  }
  return secret;
}

function isAuthorized(req: NextRequest) {
  const required = getRequiredIngestSecret();
  const authHeader = req.headers.get("authorization");
  const shortcutHeader = req.headers.get("x-shortcut-secret");

  const bearer =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

  return bearer === required || shortcutHeader === required;
}

function toHourBucket(rawTimestamp: string) {
  const date = new Date(rawTimestamp);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${rawTimestamp}`);
  }
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      0,
      0,
      0,
    ),
  );
}

function parseSamples(payload: unknown): StepSampleInput[] {
  if (!payload || typeof payload !== "object") {
    throw new Error("Body must be a JSON object");
  }

  const obj = payload as {
    timestamp?: unknown;
    steps?: unknown;
    samples?: unknown;
  };

  if (Array.isArray(obj.samples)) {
    return obj.samples.map((sample, idx) => {
      if (!sample || typeof sample !== "object") {
        throw new Error(`samples[${idx}] must be an object`);
      }
      const row = sample as { timestamp?: unknown; steps?: unknown };
      if (typeof row.timestamp !== "string") {
        throw new Error(`samples[${idx}].timestamp must be a string`);
      }
      if (typeof row.steps !== "number" || !Number.isFinite(row.steps)) {
        throw new Error(`samples[${idx}].steps must be a number`);
      }
      return {
        timestamp: row.timestamp,
        steps: Math.max(0, Math.round(row.steps)),
      };
    });
  }

  if (typeof obj.timestamp !== "string") {
    throw new Error("timestamp must be a string");
  }
  if (typeof obj.steps !== "number" || !Number.isFinite(obj.steps)) {
    throw new Error("steps must be a number");
  }

  return [
    {
      timestamp: obj.timestamp,
      steps: Math.max(0, Math.round(obj.steps)),
    },
  ];
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ stepIngestToken: string }> },
) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { stepIngestToken } = await context.params;
    const { userId } = verifyStepIngestToken(stepIngestToken);

    const payload = await request.json();
    const samples = parseSamples(payload);

    await db
      .insert(user)
      .values({
        id: userId,
        name: "Clerk User",
        email: null,
        emailVerified: null,
        image: null,
      })
      .onConflictDoNothing({ target: user.id });

    let inserted = 0;
    let updated = 0;

    for (const sample of samples) {
      const bucketStart = toHourBucket(sample.timestamp);
      const source = "apple_shortcuts";

      const existing = await db.query.hourlySteps.findFirst({
        where: and(
          eq(hourlySteps.userId, userId),
          eq(hourlySteps.bucketStart, bucketStart),
          eq(hourlySteps.source, source),
        ),
        columns: { id: true },
      });

      if (existing) {
        await db
          .update(hourlySteps)
          .set({
            stepCount: sample.steps,
            receivedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(hourlySteps.id, existing.id));
        updated += 1;
      } else {
        await db.insert(hourlySteps).values({
          userId,
          bucketStart,
          stepCount: sample.steps,
          source,
          receivedAt: new Date(),
        });
        inserted += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      userId,
      received: samples.length,
      inserted,
      updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ingest failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
