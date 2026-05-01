import { and, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { sleepWindows } from "@/db/schema";

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
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const [deleted] = await db
    .delete(sleepWindows)
    .where(and(eq(sleepWindows.id, id), eq(sleepWindows.userId, userId)))
    .returning({ id: sleepWindows.id });
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
