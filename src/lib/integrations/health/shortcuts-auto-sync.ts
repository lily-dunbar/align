import "server-only";

import { syncShortcutsStepsFromDiskToDb } from "@/lib/integrations/health/readShortcutsSteps";

const MORNING_HOUR_24 = 8;
const EVENING_HOUR_24 = 20;

type GlobalWithScheduler = typeof globalThis & {
  __alignShortcutsAutoSyncStarted?: boolean;
  __alignShortcutsAutoSyncTimer?: ReturnType<typeof setTimeout>;
};

function isEnabled(): boolean {
  const flag = process.env.SHORTCUTS_AUTO_SYNC_ENABLED?.trim().toLowerCase();
  if (!flag) return true;
  return flag === "1" || flag === "true" || flag === "yes" || flag === "on";
}

function getTargetUserId(): string | null {
  const v = process.env.SHORTCUTS_AUTO_SYNC_USER_ID?.trim();
  return v || null;
}

function nextRunFrom(now: Date): Date {
  const todayMorning = new Date(now);
  todayMorning.setHours(MORNING_HOUR_24, 0, 0, 0);

  const todayEvening = new Date(now);
  todayEvening.setHours(EVENING_HOUR_24, 0, 0, 0);

  if (now < todayMorning) return todayMorning;
  if (now < todayEvening) return todayEvening;

  const tomorrowMorning = new Date(now);
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
  tomorrowMorning.setHours(MORNING_HOUR_24, 0, 0, 0);
  return tomorrowMorning;
}

async function runOnce(userId: string, reason: "startup" | "scheduled") {
  try {
    const result = await syncShortcutsStepsFromDiskToDb(userId);
    if (!result.ok) {
      console.error(
        `[shortcuts-auto-sync] ${reason} failed: ${result.error} (path: ${result.filePath})`,
      );
      return;
    }
    console.info(
      `[shortcuts-auto-sync] ${reason} ok: steps=${result.steps} inserted=${result.inserted ?? 0} updated=${result.updated ?? 0} path=${result.filePath}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[shortcuts-auto-sync] ${reason} exception: ${message}`);
  }
}

function scheduleNext(userId: string) {
  const g = globalThis as GlobalWithScheduler;
  const now = new Date();
  const next = nextRunFrom(now);
  const delayMs = Math.max(1_000, next.getTime() - now.getTime());
  g.__alignShortcutsAutoSyncTimer = setTimeout(async () => {
    await runOnce(userId, "scheduled");
    scheduleNext(userId);
  }, delayMs);
}

export function startShortcutsAutoSyncScheduler() {
  const g = globalThis as GlobalWithScheduler;
  if (g.__alignShortcutsAutoSyncStarted) return;
  g.__alignShortcutsAutoSyncStarted = true;

  // Vercel serverless functions are short-lived; this scheduler targets long-running Node hosts.
  if (process.env.VERCEL === "1") {
    console.info("[shortcuts-auto-sync] skipping scheduler on Vercel runtime");
    return;
  }

  if (!isEnabled()) {
    console.info("[shortcuts-auto-sync] disabled via SHORTCUTS_AUTO_SYNC_ENABLED");
    return;
  }

  const userId = getTargetUserId();
  if (!userId) {
    console.info(
      "[shortcuts-auto-sync] set SHORTCUTS_AUTO_SYNC_USER_ID to enable scheduled iCloud file imports",
    );
    return;
  }

  if (process.env.SHORTCUTS_AUTO_SYNC_RUN_ON_STARTUP === "true") {
    void runOnce(userId, "startup");
  }

  scheduleNext(userId);
  console.info("[shortcuts-auto-sync] scheduler started (8:00 and 20:00 local server time)");
}
