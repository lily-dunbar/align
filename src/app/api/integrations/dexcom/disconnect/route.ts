import { eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { dexcomTokens } from "@/db/schema";

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db.delete(dexcomTokens).where(eq(dexcomTokens.userId, userId));
  return NextResponse.json({ ok: true });
}
