import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { hourlySteps, user } from "@/db/schema";
import { isStepsIngestAuthorized, getStepsIngestSharedSecret } from "@/lib/steps/ingest-auth";
import { verifyStepIngestToken } from "@/lib/steps/ingest-token";
import { getUserIdForStepIngestToken } from "@/lib/steps/token-store";

type StepSampleInput = {
  timestamp: string;
  steps: number;
};

function parseStepsValue(raw: unknown, label: string): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.round(raw));
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.max(0, Math.round(n));
  }
  throw new Error(`${label} must be a finite number`);
}

function parseTimestampValue(raw: unknown, label: string): string {
  if (typeof raw === "string") {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    throw new Error(`${label} must be a valid ISO datetime string`);
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  throw new Error(`${label} must be an ISO string or unix time`);
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
  if (Array.isArray(payload)) {
    return payload.map((sample, idx) => {
      if (!sample || typeof sample !== "object") {
        throw new Error(`samples[${idx}] must be an object`);
      }
      const row = sample as { timestamp?: unknown; steps?: unknown };
      return {
        timestamp: parseTimestampValue(row.timestamp, `samples[${idx}].timestamp`),
        steps: parseStepsValue(row.steps, `samples[${idx}].steps`),
      };
    });
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Body must be a JSON object or array of { timestamp, steps }");
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
      return {
        timestamp: parseTimestampValue(row.timestamp, `samples[${idx}].timestamp`),
        steps: parseStepsValue(row.steps, `samples[${idx}].steps`),
      };
    });
  }

  return [
    {
      timestamp: parseTimestampValue(obj.timestamp, "timestamp"),
      steps: parseStepsValue(obj.steps, "steps"),
    },
  ];
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ stepIngestToken: string }> },
) {
  try {
    if (!getStepsIngestSharedSecret()) {
      return NextResponse.json(
        {
          error:
            "Step ingest is not configured: set STEPS_INGEST_SECRET (or STEPS_TOKEN_SECRET / AUTH_SECRET) in .env.local",
        },
        { status: 500 },
      );
    }
    if (!isStepsIngestAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { stepIngestToken } = await context.params;
    let userId = await getUserIdForStepIngestToken(stepIngestToken);
    if (!userId) {
      // Backward compatibility for previously generated signed tokens.
      userId = verifyStepIngestToken(stepIngestToken).userId;
    }

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
