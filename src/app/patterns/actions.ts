"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidateTag } from "next/cache";

import { isDemoDataActive } from "@/lib/demo/is-demo-data-active";
import { isPublicDemoUser } from "@/lib/demo/public-demo";

/** Clears cross-request pattern insight cache for `patternsDataUserId` (must match session or demo preview rules). */
export async function revalidatePatternInsightsAction(
  patternsDataUserId: string,
): Promise<{ ok: boolean }> {
  const id = patternsDataUserId.trim();
  if (!id) return { ok: false };

  const { userId } = await auth();
  if (userId && userId === id) {
    revalidateTag(`patterns-insights:${id}`, "max");
    return { ok: true };
  }
  if (userId && isPublicDemoUser(id) && (await isDemoDataActive(userId))) {
    revalidateTag(`patterns-insights:${id}`, "max");
    return { ok: true };
  }
  return { ok: false };
}
