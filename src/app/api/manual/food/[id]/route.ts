import { and, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { foodEntries } from "@/db/schema";

type UpdateFoodBody = {
  title?: string;
  eatenAt?: string;
  carbsGrams?: number | null;
  proteinGrams?: number | null;
  fatGrams?: number | null;
  calories?: number | null;
  notes?: string | null;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const body = (await request.json()) as UpdateFoodBody;

  const patch: Partial<typeof foodEntries.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (typeof body.title === "string") patch.title = body.title.trim();
  if (typeof body.eatenAt === "string") {
    const d = new Date(body.eatenAt);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "eatenAt must be a valid date" }, { status: 400 });
    }
    patch.eatenAt = d;
  }
  if (body.carbsGrams !== undefined) patch.carbsGrams = body.carbsGrams ?? null;
  if (body.proteinGrams !== undefined) patch.proteinGrams = body.proteinGrams ?? null;
  if (body.fatGrams !== undefined) patch.fatGrams = body.fatGrams ?? null;
  if (body.calories !== undefined) patch.calories = body.calories ?? null;
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;

  const [updated] = await db
    .update(foodEntries)
    .set(patch)
    .where(and(eq(foodEntries.id, id), eq(foodEntries.userId, userId)))
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
    .delete(foodEntries)
    .where(and(eq(foodEntries.id, id), eq(foodEntries.userId, userId)))
    .returning({ id: foodEntries.id });
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
