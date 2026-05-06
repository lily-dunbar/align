import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { userDisplayPreferences } from "@/db/schema";

export async function needsOnboarding(userId: string): Promise<boolean> {
  try {
    const row = await db.query.userDisplayPreferences.findFirst({
      where: eq(userDisplayPreferences.userId, userId),
      columns: { onboardingCompleted: true },
    });

    // Existing user with no pref row should still see onboarding.
    if (!row) return true;
    return !row.onboardingCompleted;
  } catch (error) {
    // During transient DB outages, avoid forcing users through onboarding.
    console.warn("Onboarding gate check unavailable; not forcing onboarding.", error);
    return false;
  }
}
