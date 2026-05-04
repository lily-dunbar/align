import { and, eq, isNull, ne, or } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { foodEntries, manualWorkouts, sleepWindows } from "@/db/schema";
import { DEMO_FOOD_NOTE, DEMO_SLEEP_NOTE } from "@/lib/demo-markers";
import { isDeveloperSettingsEnabled } from "@/lib/developer-settings";

/**
 * Deletes manual workouts and user-entered food/sleep rows.
 * Preserves rows tagged by `scripts/seed-demo.ts` (demo_* markers).
 */
export async function POST() {
  if (!isDeveloperSettingsEnabled()) {
    return NextResponse.json({ error: "Developer settings are disabled" }, { status: 403 });
  }
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const deletedWorkouts = await db
    .delete(manualWorkouts)
    .where(eq(manualWorkouts.userId, userId))
    .returning({ id: manualWorkouts.id });

  const deletedFood = await db
    .delete(foodEntries)
    .where(
      and(
        eq(foodEntries.userId, userId),
        or(isNull(foodEntries.notes), ne(foodEntries.notes, DEMO_FOOD_NOTE)),
      ),
    )
    .returning({ id: foodEntries.id });

  const deletedSleep = await db
    .delete(sleepWindows)
    .where(
      and(
        eq(sleepWindows.userId, userId),
        or(isNull(sleepWindows.notes), ne(sleepWindows.notes, DEMO_SLEEP_NOTE)),
      ),
    )
    .returning({ id: sleepWindows.id });

  return NextResponse.json({
    ok: true,
    deleted: {
      manualWorkouts: deletedWorkouts.length,
      foodEntries: deletedFood.length,
      sleepWindows: deletedSleep.length,
    },
  });
}
