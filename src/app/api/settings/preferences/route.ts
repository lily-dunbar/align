import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  getUserPreferences,
  updateUserPreferences,
  type UserPreferences,
} from "@/lib/user-display-preferences";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const preferences = await getUserPreferences(userId);
  return NextResponse.json({ preferences });
}

type PatchBody = Partial<UserPreferences>;

export async function PATCH(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as PatchBody;
  const patch: PatchBody = {};

  if (typeof body.showSteps === "boolean") patch.showSteps = body.showSteps;
  if (typeof body.showActivity === "boolean") patch.showActivity = body.showActivity;
  if (typeof body.showSleep === "boolean") patch.showSleep = body.showSleep;
  if (typeof body.showFood === "boolean") patch.showFood = body.showFood;
  if (typeof body.patternThresholdPercent === "number") {
    patch.patternThresholdPercent = body.patternThresholdPercent;
  }
  if (typeof body.targetLowMgdl === "number") patch.targetLowMgdl = body.targetLowMgdl;
  if (typeof body.targetHighMgdl === "number") patch.targetHighMgdl = body.targetHighMgdl;
  if (typeof body.targetTirPercent === "number") patch.targetTirPercent = body.targetTirPercent;
  if (typeof body.targetStepsPerDay === "number") {
    patch.targetStepsPerDay = body.targetStepsPerDay;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    const preferences = await updateUserPreferences(userId, patch);
    return NextResponse.json({ preferences });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid preferences";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
