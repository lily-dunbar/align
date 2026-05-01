import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { deleteStepIngestToken } from "@/lib/steps/token-store";

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await deleteStepIngestToken(userId);
  return NextResponse.json({ ok: true });
}
