import { desc, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { manualWorkouts } from "@/db/schema";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db.query.manualWorkouts.findMany({
    where: eq(manualWorkouts.userId, userId),
    orderBy: [desc(manualWorkouts.startedAt)],
    limit: 200,
  });
  return NextResponse.json({ items: rows });
}

type CreateWorkoutBody = {
  workoutType: string;
  startedAt: string;
  endedAt?: string | null;
  distanceMeters?: number | null;
  pace?: string | null;
  durationMin?: number | null;
  intensity?: string | null;
  notes?: string | null;
};

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as CreateWorkoutBody;
  if (!body.workoutType?.trim()) {
    return NextResponse.json({ error: "workoutType is required" }, { status: 400 });
  }
  if (!body.startedAt) {
    return NextResponse.json({ error: "startedAt is required" }, { status: 400 });
  }

  const startedAt = new Date(body.startedAt);
  if (Number.isNaN(startedAt.getTime())) {
    return NextResponse.json({ error: "startedAt must be a valid date" }, { status: 400 });
  }
  const endedAt = body.endedAt ? new Date(body.endedAt) : null;
  if (endedAt && Number.isNaN(endedAt.getTime())) {
    return NextResponse.json({ error: "endedAt must be a valid date" }, { status: 400 });
  }

  const [created] = await db
    .insert(manualWorkouts)
    .values({
      userId,
      workoutType: body.workoutType.trim(),
      startedAt,
      endedAt,
      distanceMeters: body.distanceMeters ?? null,
      pace: body.pace?.trim() || null,
      durationMin: body.durationMin ?? null,
      intensity: body.intensity?.trim() || null,
      notes: body.notes?.trim() || null,
    })
    .returning();

  return NextResponse.json({ item: created }, { status: 201 });
}
