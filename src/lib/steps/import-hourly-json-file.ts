import "server-only";

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { hourlySteps, user } from "@/db/schema";

export function expandUserPath(raw: string): string {
  let p = raw.trim();
  if (
    (p.startsWith('"') && p.endsWith('"') && p.length >= 2) ||
    (p.startsWith("'") && p.endsWith("'") && p.length >= 2)
  ) {
    p = p.slice(1, -1).trim();
  }
  if (p.startsWith("~/")) {
    return join(homedir(), p.slice(2));
  }
  if (p === "~") {
    return homedir();
  }
  return p;
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

function parseSamplesJson(text: string): { timestamp: string; steps: number }[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("File is not valid JSON");
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { samples?: unknown }).samples)
      ? (parsed as { samples: unknown[] }).samples
      : null;

  if (!rows) {
    throw new Error('Expected a JSON array or an object with a "samples" array');
  }

  const out: { timestamp: string; steps: number }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row !== "object") {
      throw new Error(`Row ${i} must be an object`);
    }
    const { steps, timestamp } = row as Record<string, unknown>;
    if (typeof timestamp !== "string") {
      throw new Error(`Row ${i}: timestamp must be a string (ISO date)`);
    }
    const stepsNum =
      typeof steps === "number" && Number.isFinite(steps)
        ? steps
        : typeof steps === "string" && steps.trim() !== "" && Number.isFinite(Number(steps))
          ? Number(steps)
          : NaN;
    if (!Number.isFinite(stepsNum)) {
      throw new Error(`Row ${i}: steps must be a finite number`);
    }
    out.push({ timestamp, steps: Math.max(0, Math.round(stepsNum)) });
  }
  return out;
}

/**
 * Upsert hourly rows from JSON text (array or `{ samples: [...] }`).
 * Uses source `apple_shortcuts`.
 */
export async function importHourlyStepsFromJsonString(
  userId: string,
  text: string,
): Promise<{ inserted: number; updated: number; unchanged: number; count: number }> {
  const samples = parseSamplesJson(text);

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

  const source = "apple_shortcuts";
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const sample of samples) {
    const bucketStart = toHourBucket(sample.timestamp);
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

  return { inserted, updated, unchanged, count: samples.length };
}

/**
 * Read JSON file from disk and upsert hourly rows (source `apple_shortcuts`).
 */
export async function importHourlyStepsFromJsonFile(
  userId: string,
  absolutePath: string,
): Promise<{ inserted: number; updated: number; unchanged: number; count: number }> {
  const path = expandUserPath(absolutePath);
  const text = await readFile(path, "utf8");
  return importHourlyStepsFromJsonString(userId, text);
}
