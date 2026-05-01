import { desc, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { foodEntries } from "@/db/schema";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.query.foodEntries.findMany({
    where: eq(foodEntries.userId, userId),
    orderBy: [desc(foodEntries.eatenAt)],
    limit: 200,
  });
  return NextResponse.json({ items: rows });
}

type CreateFoodBody = {
  title?: string | null;
  eatenAt: string;
  carbsGrams?: number | null;
  proteinGrams?: number | null;
  fatGrams?: number | null;
  calories?: number | null;
  notes?: string | null;
};

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as CreateFoodBody;
  const eatenAt = new Date(body.eatenAt);
  if (Number.isNaN(eatenAt.getTime())) {
    return NextResponse.json({ error: "eatenAt must be a valid date" }, { status: 400 });
  }

  const [created] = await db
    .insert(foodEntries)
    .values({
      userId,
      title: body.title?.trim() || "Meal",
      eatenAt,
      carbsGrams: body.carbsGrams ?? null,
      proteinGrams: body.proteinGrams ?? null,
      fatGrams: body.fatGrams ?? null,
      calories: body.calories ?? null,
      notes: body.notes?.trim() || null,
    })
    .returning();
  return NextResponse.json({ item: created }, { status: 201 });
}
