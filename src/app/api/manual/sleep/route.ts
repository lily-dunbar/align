import { desc, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { sleepWindows } from "@/db/schema";

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

  const [created] = await db
    .insert(sleepWindows)
    .values({
      userId,
      sleepStart,
      sleepEnd,
      source: body.source?.trim() || "manual",
      qualityScore: body.qualityScore ?? null,
      notes: body.notes?.trim() || null,
    })
    .returning();
  return NextResponse.json({ item: created }, { status: 201 });
}
