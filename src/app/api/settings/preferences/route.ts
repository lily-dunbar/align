import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { PUBLIC_DEMO_USER_ID } from "@/lib/demo/public-demo";
import {
  getUserPreferences,
  parseOptionalIanaTimeZone,
  updateUserPreferences,
  type UserPreferences,
} from "@/lib/user-display-preferences";
import {
  canUserPatchDeveloperDemoMode,
  isDeveloperSettingsEnabled,
} from "@/lib/developer-settings";

export async function GET(request: Request) {
  const { userId } = await auth();
  const url = new URL(request.url);
  const v = url.searchParams.get("demo")?.trim().toLowerCase();
  const demoMode = v === "1" || v === "true" || v === "yes";
  const effectiveUserId = userId ?? (demoMode ? PUBLIC_DEMO_USER_ID : null);
  if (!effectiveUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const preferences = await getUserPreferences(effectiveUserId);
  return NextResponse.json({ preferences });
}

type PatchBody = Partial<UserPreferences>;

export async function PATCH(request: Request) {
  const { userId } = await auth();
  const url = new URL(request.url);
  const v = url.searchParams.get("demo")?.trim().toLowerCase();
  const demoMode = v === "1" || v === "true" || v === "yes";
  const effectiveUserId = userId ?? (demoMode ? PUBLIC_DEMO_USER_ID : null);
  if (!effectiveUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as PatchBody;
  const patch: PatchBody = {};

  const dev = isDeveloperSettingsEnabled();
  if (!demoMode && body.developerDemoMode !== undefined && !canUserPatchDeveloperDemoMode(effectiveUserId)) {
    return NextResponse.json({ error: "Demo mode cannot be changed for this account" }, { status: 403 });
  }
  /** Completing onboarding (`true`) is always allowed; clearing (`false`) is developer-only or via reset route. */
  if (body.onboardingCompleted === false && !dev) {
    return NextResponse.json({ error: "Developer settings are disabled" }, { status: 403 });
  }

  if (typeof body.showSteps === "boolean") patch.showSteps = body.showSteps;
  if (typeof body.showActivity === "boolean") patch.showActivity = body.showActivity;
  if (typeof body.showSleep === "boolean") patch.showSleep = body.showSleep;
  if (typeof body.showFood === "boolean") patch.showFood = body.showFood;
  if (typeof body.showCarbsLoggedSummary === "boolean") {
    patch.showCarbsLoggedSummary = body.showCarbsLoggedSummary;
  }
  if (body.ianaTimeZone !== undefined) {
    try {
      patch.ianaTimeZone = parseOptionalIanaTimeZone(body.ianaTimeZone);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Invalid time zone";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }
  if (typeof body.patternThresholdPercent === "number") {
    patch.patternThresholdPercent = body.patternThresholdPercent;
  }
  if (typeof body.targetLowMgdl === "number") patch.targetLowMgdl = body.targetLowMgdl;
  if (typeof body.targetHighMgdl === "number") patch.targetHighMgdl = body.targetHighMgdl;
  if (typeof body.targetTirPercent === "number") patch.targetTirPercent = body.targetTirPercent;
  if (typeof body.targetStepsPerDay === "number") {
    patch.targetStepsPerDay = body.targetStepsPerDay;
  }
  if (!demoMode && typeof body.developerDemoMode === "boolean") {
    patch.developerDemoMode = body.developerDemoMode;
  }
  if (!demoMode && typeof body.onboardingCompleted === "boolean") {
    patch.onboardingCompleted = body.onboardingCompleted;
  }
  if (typeof body.dexcomBackfill90PromptDismissed === "boolean") {
    patch.dexcomBackfill90PromptDismissed = body.dexcomBackfill90PromptDismissed;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    const preferences = await updateUserPreferences(effectiveUserId, patch);
    return NextResponse.json({ preferences });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid preferences";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
