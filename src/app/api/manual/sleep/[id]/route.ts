import { and, eq, gte, inArray } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { sleepWindows } from "@/db/schema";
import { parseSleepRecurrenceMeta } from "@/lib/manual/sleep-recurrence";

type UpdateSleepBody = {
  sleepStart?: string;
  sleepEnd?: string;
  source?: string | null;
  qualityScore?: number | null;
  notes?: string | null;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const body = (await request.json()) as UpdateSleepBody;
  const patch: Partial<typeof sleepWindows.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (typeof body.sleepStart === "string") {
    const d = new Date(body.sleepStart);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "sleepStart must be a valid date" }, { status: 400 });
    }
    patch.sleepStart = d;
  }
  if (typeof body.sleepEnd === "string") {
    const d = new Date(body.sleepEnd);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "sleepEnd must be a valid date" }, { status: 400 });
    }
    patch.sleepEnd = d;
  }
  if (body.source !== undefined) patch.source = body.source?.trim() || "manual";
  if (body.qualityScore !== undefined) patch.qualityScore = body.qualityScore ?? null;
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;

  const [updated] = await db
    .update(sleepWindows)
    .set(patch)
    .where(and(eq(sleepWindows.id, id), eq(sleepWindows.userId, userId)))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item: updated });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");

  if (scope === "future") {
    const [base] = await db
      .select({
        id: sleepWindows.id,
        sleepStart: sleepWindows.sleepStart,
        notes: sleepWindows.notes,
      })
      .from(sleepWindows)
      .where(and(eq(sleepWindows.id, id), eq(sleepWindows.userId, userId)))
      .limit(1);
    if (!base) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const meta = parseSleepRecurrenceMeta(base.notes);
    if (!meta?.seriesId) {
      return NextResponse.json(
        { error: "This sleep entry is not part of a recurring series." },
        { status: 400 },
      );
    }

    const from = base.sleepStart;
    const candidates = await db.query.sleepWindows.findMany({
      where: and(eq(sleepWindows.userId, userId), gte(sleepWindows.sleepStart, from)),
      columns: { id: true, notes: true },
    });
    const ids = candidates
      .filter((r) => parseSleepRecurrenceMeta(r.notes)?.seriesId === meta.seriesId)
      .map((r) => r.id);
    if (ids.length === 0) return NextResponse.json({ ok: true, deletedCount: 0 });

    const deleted = await db
      .delete(sleepWindows)
      .where(and(eq(sleepWindows.userId, userId), inArray(sleepWindows.id, ids)))
      .returning({ id: sleepWindows.id });
    return NextResponse.json({ ok: true, deletedCount: deleted.length });
  }

  const [deleted] = await db
    .delete(sleepWindows)
    .where(and(eq(sleepWindows.id, id), eq(sleepWindows.userId, userId)))
    .returning({ id: sleepWindows.id });
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
