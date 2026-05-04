import "server-only";

import { isDemoModeEnabled } from "@/lib/demo-markers";
import { getDeveloperDemoModeForUser } from "@/lib/user-display-preferences";

/** True when global env demo is on or this account has the Developer demo toggle. */
export async function isDemoDataActive(userId: string): Promise<boolean> {
  if (isDemoModeEnabled()) return true;
  return getDeveloperDemoModeForUser(userId);
}
