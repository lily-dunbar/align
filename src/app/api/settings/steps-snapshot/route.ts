import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getStepsIntegrationSnapshot } from "@/lib/settings/steps-snapshot";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const steps = await getStepsIntegrationSnapshot(userId);
    return NextResponse.json(
      { steps },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.warn("[steps-snapshot] GET failed:", error);
    return NextResponse.json(
      { error: "Could not load steps snapshot" },
      { status: 503 },
    );
  }
}
