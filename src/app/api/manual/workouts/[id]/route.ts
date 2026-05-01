import { and, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { manualWorkouts } from "@/db/schema";

type UpdateWorkoutBody = {
  workoutType?: string;
  startedAt?: string;
  endedAt?: string | null;
  distanceMeters?: number | null;
  pace?: string | null;
  durationMin?: number | null;
  intensity?: string | null;
  notes?: string | null;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const body = (await request.json()) as UpdateWorkoutBody;

  const patch: Partial<typeof manualWorkouts.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (typeof body.workoutType === "string") patch.workoutType = body.workoutType.trim();
  if (typeof body.startedAt === "string") {
    const d = new Date(body.startedAt);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "startedAt must be a valid date" }, { status: 400 });
    }
    patch.startedAt = d;
  }
  if (body.endedAt !== undefined) {
    if (body.endedAt === null) patch.endedAt = null;
    else {
      const d = new Date(body.endedAt);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "endedAt must be a valid date" }, { status: 400 });
      }
      patch.endedAt = d;
    }
  }
  if (body.distanceMeters !== undefined) patch.distanceMeters = body.distanceMeters ?? null;
  if (body.pace !== undefined) patch.pace = body.pace?.trim() || null;
  if (body.durationMin !== undefined) patch.durationMin = body.durationMin ?? null;
  if (body.intensity !== undefined) patch.intensity = body.intensity?.trim() || null;
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;

  const [updated] = await db
    .update(manualWorkouts)
    .set(patch)
    .where(and(eq(manualWorkouts.id, id), eq(manualWorkouts.userId, userId)))
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
    .delete(manualWorkouts)
    .where(and(eq(manualWorkouts.id, id), eq(manualWorkouts.userId, userId)))
    .returning({ id: manualWorkouts.id });

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
