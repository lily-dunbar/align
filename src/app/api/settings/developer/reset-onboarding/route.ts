import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { isDeveloperSettingsEnabled } from "@/lib/developer-settings";
import { updateUserPreferences } from "@/lib/user-display-preferences";

/** Sets `onboardingCompleted` to false so first-run flows can show again. */
export async function POST() {
  if (!isDeveloperSettingsEnabled()) {
    return NextResponse.json({ error: "Developer settings are disabled" }, { status: 403 });
  }
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const preferences = await updateUserPreferences(userId, { onboardingCompleted: false });
  return NextResponse.json({ ok: true, preferences });
}
