import { desc, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { sleepWindows } from "@/db/schema";
import {
  buildSleepRecurrenceNotes,
  type SleepRecurrenceFreq,
} from "@/lib/manual/sleep-recurrence";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.query.sleepWindows.findMany({
    where: eq(sleepWindows.userId, userId),
    orderBy: [desc(sleepWindows.sleepStart)],
    limit: 200,
  });
  return NextResponse.json({ items: rows });
}

type CreateSleepBody = {
  sleepStart: string;
  sleepEnd: string;
  source?: string | null;
  qualityScore?: number | null;
  notes?: string | null;
  recurrence?: {
    enabled: boolean;
    freq?: SleepRecurrenceFreq;
  };
};

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as CreateSleepBody;
  const sleepStart = new Date(body.sleepStart);
  const sleepEnd = new Date(body.sleepEnd);
  if (Number.isNaN(sleepStart.getTime()) || Number.isNaN(sleepEnd.getTime())) {
    return NextResponse.json(
      { error: "sleepStart and sleepEnd must be valid dates" },
      { status: 400 },
    );
  }

  const freq = body.recurrence?.enabled
    ? (body.recurrence.freq === "daily" || body.recurrence.freq === "weekly"
        ? body.recurrence.freq
        : "weekly")
    : null;
  const stepDays = freq === "daily" ? 1 : freq === "weekly" ? 7 : 0;
  const occurrences = freq === "daily" ? 60 : freq === "weekly" ? 26 : 1;
  const seriesId = freq ? crypto.randomUUID() : null;
  const recurrenceNotes = freq
    ? buildSleepRecurrenceNotes({
        v: 1,
        seriesId: seriesId!,
        freq,
        anchorSleepStartIso: sleepStart.toISOString(),
      })
    : body.notes?.trim() || null;

  const rows: typeof sleepWindows.$inferInsert[] = [];
  for (let i = 0; i < occurrences; i += 1) {
    const shiftMs = i * stepDays * 24 * 60 * 60 * 1000;
    rows.push({
      userId,
      sleepStart: new Date(sleepStart.getTime() + shiftMs),
      sleepEnd: new Date(sleepEnd.getTime() + shiftMs),
      source: body.source?.trim() || "manual",
      qualityScore: body.qualityScore ?? null,
      notes: recurrenceNotes,
    });
  }

  const created = await db.insert(sleepWindows).values(rows).returning();
  return NextResponse.json(
    { item: created[0], items: created, createdCount: created.length },
    { status: 201 },
  );
}
