import "server-only";

import { getDeveloperDemoModeForUser } from "@/lib/user-display-preferences";

/**
 * Synthetic demo streams only when this user has Demo Mode on in Settings.
 * (`DEMO_MODE` env does not override — so production users can always turn demo off.)
 */
export async function isDemoDataActive(userId: string): Promise<boolean> {
  return getDeveloperDemoModeForUser(userId);
}
