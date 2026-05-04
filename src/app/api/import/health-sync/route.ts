import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { syncShortcutsStepsFromDiskToDb } from "@/lib/integrations/health/readShortcutsSteps";

/**
 * Pull latest steps from the Shortcuts iCloud-synced file on this machine and upsert hourly_steps.
 * See lib/integrations/health/readShortcutsSteps.ts (SHORTCUTS_STEPS_FILE_PATH, CSV format).
 */
export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncShortcutsStepsFromDiskToDb(userId);
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}
