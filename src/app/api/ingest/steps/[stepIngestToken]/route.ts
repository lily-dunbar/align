import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { hourlySteps, user } from "@/db/schema";
import { isStepsIngestAuthorized } from "@/lib/steps/ingest-auth";
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

/**
 * Apple Shortcuts often JSON-encodes a Date in a Dictionary as an object, not a string.
 * Normalize to string or number before parsing.
 */
function unwrapShortcutTimestamp(raw: unknown): unknown {
  if (raw === null || raw === undefined) return raw;
  if (typeof raw !== "object" || Array.isArray(raw)) return raw;

  const o = raw as Record<string, unknown>;
  for (const key of [
    "ISO8601String",
    "ISO8601",
    "iso8601",
    "W3C",
    "date",
    "string",
    "text",
    "value",
    // Shortcuts / plist-style hints
    "U",
    "u",
    "epoch",
    "seconds",
    "unixTimestamp",
  ]) {
    const inner = o[key];
    if (typeof inner === "string" || typeof inner === "number") return inner;
  }
  const vals = Object.values(o);
  if (vals.length === 1) {
    const lone = vals[0];
    if (typeof lone === "string" || typeof lone === "number") return lone;
  }
  return raw;
}

function parseTimestampValue(raw: unknown, label: string): string {
  if (raw === undefined || raw === null) {
    throw new Error(
      `${label} is missing. Use JSON like { "timestamp": "…", "steps": 123 } with both keys at the root of the body — in Shortcuts remove any wrapper row whose key is literally "Key", and add Format Date (ISO 8601) before the Dictionary.`,
    );
  }
  if (typeof raw === "string" && raw.trim() === "") {
    throw new Error(
      `${label} is empty. Use Format Date → ISO 8601 for the health sample start time, not a blank string.`,
    );
  }

  const unwrapped = unwrapShortcutTimestamp(raw);

  if (typeof unwrapped === "string") {
    const trimmed = unwrapped.trim();
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    throw new Error(
      `${label} is not a valid date string ("${trimmed.slice(0, 80)}${trimmed.length > 80 ? "…" : ""}"). In Shortcuts add an action: Format Date → Custom → ISO 8601, then put that text in Dictionary key timestamp.`,
    );
  }
  if (typeof unwrapped === "number" && Number.isFinite(unwrapped)) {
    const ms = unwrapped < 1e12 ? unwrapped * 1000 : unwrapped;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (typeof unwrapped === "object" && unwrapped !== null && !Array.isArray(unwrapped)) {
    throw new Error(
      `${label} was sent as a JSON object (Shortcuts date). Add action "Format Date" with ISO 8601 on Start Date, then use that formatted text (not the raw date) as timestamp.`,
    );
  }
  throw new Error(
    `${label} must be an ISO datetime string or unix time (seconds or ms). Use Format Date → ISO 8601 in Shortcuts.`,
  );
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

/** Shortcuts often wraps the Dictionary as `{ "Key": { … } }`. Unwrap recursively. */
function unwrapShortcutsKeyWrapper(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const o = payload as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length === 1 && keys[0] === "Key") {
    return unwrapShortcutsKeyWrapper(o.Key);
  }
  return payload;
}

/** Accept typical Shortcuts / Health export names (PascalCase, synonyms). */
function aliasSampleFields(row: Record<string, unknown>): {
  timestamp?: unknown;
  steps?: unknown;
} {
  const timestamp =
    row.timestamp ??
    row.Timestamp ??
    row.startDate ??
    row.StartDate ??
    row.date ??
    row.Date ??
    row.time ??
    row.Time;

  const steps =
    row.steps ??
    row.Steps ??
    row.count ??
    row.Count ??
    row.quantity ??
    row.Quantity ??
    row.value ??
    row.Value;

  return { timestamp, steps };
}

function parseSamples(payload: unknown): StepSampleInput[] {
  const normalized = unwrapShortcutsKeyWrapper(payload);

  if (Array.isArray(normalized)) {
    return normalized.map((sample, idx) => {
      if (!sample || typeof sample !== "object") {
        throw new Error(`[${idx}] must be an object`);
      }
      const row = aliasSampleFields(sample as Record<string, unknown>);
      return {
        timestamp: parseTimestampValue(row.timestamp, `samples[${idx}].timestamp`),
        steps: parseStepsValue(row.steps, `samples[${idx}].steps`),
      };
    });
  }

  if (!normalized || typeof normalized !== "object") {
    throw new Error("Body must be a JSON object or array of { timestamp, steps }");
  }

  const obj = normalized as Record<string, unknown>;

  if (Array.isArray(obj.samples)) {
    return obj.samples.map((sample, idx) => {
      if (!sample || typeof sample !== "object") {
        throw new Error(`samples[${idx}] must be an object`);
      }
      const row = aliasSampleFields(sample as Record<string, unknown>);
      return {
        timestamp: parseTimestampValue(row.timestamp, `samples[${idx}].timestamp`),
        steps: parseStepsValue(row.steps, `samples[${idx}].steps`),
      };
    });
  }

  const row = aliasSampleFields(obj);
  return [
    {
      timestamp: parseTimestampValue(row.timestamp, "timestamp"),
      steps: parseStepsValue(row.steps, "steps"),
    },
  ];
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ stepIngestToken: string }> },
) {
  try {
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
    let unchanged = 0;

    for (const sample of samples) {
      const bucketStart = toHourBucket(sample.timestamp);
      const source = "apple_shortcuts";

      const existing = await db.query.hourlySteps.findFirst({
        where: and(
          eq(hourlySteps.userId, userId),
          eq(hourlySteps.bucketStart, bucketStart),
          eq(hourlySteps.source, source),
        ),
        columns: { id: true, stepCount: true },
      });

      if (existing) {
        if (existing.stepCount === sample.steps) {
          unchanged += 1;
        } else {
          await db
            .update(hourlySteps)
            .set({
              stepCount: sample.steps,
              receivedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(hourlySteps.id, existing.id));
          updated += 1;
        }
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
      unchanged,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ingest failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
