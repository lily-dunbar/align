import "server-only";

import { pg } from "@/db";

/**
 * Production DBs sometimes miss a migration (preview envs, manual DB restore).
 * Adds the column idempotently so Drizzle selects match the schema until migrate catches up.
 */
let prefsColumnsReady: Promise<void> | null = null;

function shouldIgnoreRuntimeDdlError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message =
    "message" in error && typeof error.message === "string" ? error.message : "";
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  return (
    code === "53300" ||
    message.includes("planLimitReached") ||
    message.includes("Failed to identify your database") ||
    message.includes("too many connections")
  );
}

export function ensureUserDisplayPrefsDexcomBackfillColumn(): Promise<void> {
  // Backwards-compatible name; now ensures multiple columns.
  if (!prefsColumnsReady) {
    prefsColumnsReady = (async () => {
      try {
        await pg`
          ALTER TABLE "user_display_preferences"
          ADD COLUMN IF NOT EXISTS "dexcom_backfill_90_prompt_dismissed" boolean DEFAULT false NOT NULL
        `;
        await pg`
          ALTER TABLE "user_display_preferences"
          ADD COLUMN IF NOT EXISTS "show_carbs_logged_summary" boolean DEFAULT true NOT NULL
        `;
        await pg`
          ALTER TABLE "user_display_preferences"
          ADD COLUMN IF NOT EXISTS "developer_demo_mode" boolean DEFAULT false NOT NULL
        `;
      } catch (e) {
        if (shouldIgnoreRuntimeDdlError(e)) {
          console.warn(
            "Skipping runtime display preference DDL due to database account restrictions.",
          );
          return;
        }
        prefsColumnsReady = null;
        throw e;
      }
    })();
  }
  return prefsColumnsReady;
}
