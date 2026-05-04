import "server-only";

import { getUserPreferences } from "@/lib/user-display-preferences";

export async function needsOnboarding(userId: string): Promise<boolean> {
  const prefs = await getUserPreferences(userId);
  return !prefs.onboardingCompleted;
}
