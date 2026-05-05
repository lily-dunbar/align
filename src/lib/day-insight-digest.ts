import "server-only";
import { createHash } from "crypto";

import type { DayInsightSnapshot } from "@/lib/day-insight-context";

/** Stable fingerprint for day insight inputs — skip LLM + repeated JSON work when unchanged. */
export function digestDayInsightSnapshot(snapshot: DayInsightSnapshot): string {
  return createHash("sha256").update(JSON.stringify(snapshot), "utf8").digest("hex");
}
