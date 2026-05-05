import { eq } from "drizzle-orm";

import { db } from "@/db";
import { user, userDisplayPreferences } from "@/db/schema";
import {
  PATTERN_THRESHOLD_DEFAULT,
  PATTERN_THRESHOLD_MAX,
  PATTERN_THRESHOLD_MIN,
} from "@/lib/pattern-threshold-constants";
import { formatYmdInZone } from "@/lib/patterns/format-ymd";
import {
  GLUCOSE_HIGH_MAX,
  GLUCOSE_HIGH_MIN,
  GLUCOSE_LOW_MAX,
  GLUCOSE_LOW_MIN,
  GLUCOSE_TARGET_HIGH_DEFAULT,
  GLUCOSE_TARGET_LOW_DEFAULT,
  TARGET_STEPS_MAX,
  TARGET_STEPS_MIN,
  TARGET_STEPS_PER_DAY_DEFAULT,
  TARGET_TIR_MAX,
  TARGET_TIR_MIN,
  TARGET_TIR_PERCENT_DEFAULT,
} from "@/lib/user-target-constants";

/** All persisted user display, targets, and pattern settings (single row per user). */
export type UserPreferences = {
  showSteps: boolean;
  showActivity: boolean;
  showSleep: boolean;
  showFood: boolean;
  /** IANA name, or null = use this device’s time zone for calendar days / insights. */
  ianaTimeZone: string | null;
  patternThresholdPercent: number;
  targetLowMgdl: number;
  targetHighMgdl: number;
  targetTirPercent: number;
  targetStepsPerDay: number;
  developerDemoMode: boolean;
  onboardingCompleted: boolean;
};

export type DisplayPreferences = Pick<
  UserPreferences,
  "showSteps" | "showActivity" | "showSleep" | "showFood"
>;

export {
  PATTERN_THRESHOLD_DEFAULT,
  PATTERN_THRESHOLD_MAX,
  PATTERN_THRESHOLD_MIN,
} from "@/lib/pattern-threshold-constants";

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  showSteps: true,
  showActivity: true,
  showSleep: true,
  showFood: true,
  ianaTimeZone: null,
  patternThresholdPercent: PATTERN_THRESHOLD_DEFAULT,
  targetLowMgdl: GLUCOSE_TARGET_LOW_DEFAULT,
  targetHighMgdl: GLUCOSE_TARGET_HIGH_DEFAULT,
  targetTirPercent: TARGET_TIR_PERCENT_DEFAULT,
  targetStepsPerDay: TARGET_STEPS_PER_DAY_DEFAULT,
  developerDemoMode: false,
  onboardingCompleted: false,
};

async function ensureLocalUser(userId: string) {
  await db
    .insert(user)
    .values({
      id: userId,
      name: "Clerk User",
      email: null,
      emailVerified: null,
      image: null,
    })
    .onConflictDoNothing({ target: user.id });
}

export function clampPatternThresholdPercent(value: number): number {
  return Math.min(
    PATTERN_THRESHOLD_MAX,
    Math.max(PATTERN_THRESHOLD_MIN, Math.round(value)),
  );
}

export function clampTargetLowMgdl(value: number): number {
  return Math.min(GLUCOSE_LOW_MAX, Math.max(GLUCOSE_LOW_MIN, Math.round(value)));
}

export function clampTargetHighMgdl(value: number): number {
  return Math.min(GLUCOSE_HIGH_MAX, Math.max(GLUCOSE_HIGH_MIN, Math.round(value)));
}

export function clampTargetTirPercent(value: number): number {
  return Math.min(TARGET_TIR_MAX, Math.max(TARGET_TIR_MIN, Math.round(value)));
}

export function clampTargetStepsPerDay(value: number): number {
  return Math.min(TARGET_STEPS_MAX, Math.max(TARGET_STEPS_MIN, Math.round(value)));
}

/** Accepts trimmed IANA id, empty string, or null to clear. */
export function parseOptionalIanaTimeZone(input: unknown): string | null {
  if (input === null) return null;
  if (typeof input !== "string") {
    throw new Error("Time zone must be a string or null.");
  }
  const t = input.trim();
  if (!t) return null;
  try {
    formatYmdInZone(new Date(), t);
    return t;
  } catch {
    throw new Error(`Unknown or invalid IANA time zone: ${t}`);
  }
}

function rowToPreferences(row: typeof userDisplayPreferences.$inferSelect): UserPreferences {
  return {
    showSteps: row.showSteps,
    showActivity: row.showActivity,
    showSleep: row.showSleep,
    showFood: row.showFood,
    ianaTimeZone: row.ianaTimeZone?.trim() ? row.ianaTimeZone.trim() : null,
    patternThresholdPercent: row.patternThresholdPercent,
    targetLowMgdl: row.targetLowMgdl,
    targetHighMgdl: row.targetHighMgdl,
    targetTirPercent: row.targetTirPercent,
    targetStepsPerDay: row.targetStepsPerDay,
    developerDemoMode: row.developerDemoMode ?? false,
    onboardingCompleted: row.onboardingCompleted ?? false,
  };
}

function mergePreferences(
  current: UserPreferences,
  patch: Partial<UserPreferences>,
): UserPreferences {
  const next = { ...current };
  if (typeof patch.showSteps === "boolean") next.showSteps = patch.showSteps;
  if (typeof patch.showActivity === "boolean") next.showActivity = patch.showActivity;
  if (typeof patch.showSleep === "boolean") next.showSleep = patch.showSleep;
  if (typeof patch.showFood === "boolean") next.showFood = patch.showFood;
  if (patch.ianaTimeZone !== undefined) {
    next.ianaTimeZone =
      patch.ianaTimeZone === null ? null : parseOptionalIanaTimeZone(patch.ianaTimeZone);
  }
  if (typeof patch.patternThresholdPercent === "number") {
    next.patternThresholdPercent = clampPatternThresholdPercent(patch.patternThresholdPercent);
  }
  if (typeof patch.targetLowMgdl === "number") {
    next.targetLowMgdl = clampTargetLowMgdl(patch.targetLowMgdl);
  }
  if (typeof patch.targetHighMgdl === "number") {
    next.targetHighMgdl = clampTargetHighMgdl(patch.targetHighMgdl);
  }
  if (typeof patch.targetTirPercent === "number") {
    next.targetTirPercent = clampTargetTirPercent(patch.targetTirPercent);
  }
  if (typeof patch.targetStepsPerDay === "number") {
    next.targetStepsPerDay = clampTargetStepsPerDay(patch.targetStepsPerDay);
  }
  if (typeof patch.developerDemoMode === "boolean") next.developerDemoMode = patch.developerDemoMode;
  if (typeof patch.onboardingCompleted === "boolean") {
    next.onboardingCompleted = patch.onboardingCompleted;
  }
  return next;
}

export function validateGlucoseTargetRange(low: number, high: number): void {
  if (!(low < high)) {
    throw new Error("Glucose low target must be less than high target (mg/dL).");
  }
}

/** @deprecated use getUserPreferences */
export async function getOrCreateDisplayPreferences(
  userId: string,
): Promise<UserPreferences> {
  return getUserPreferences(userId);
}

/** Banner: per-user demo flag (no insert). */
export async function getDeveloperDemoModeForUser(userId: string): Promise<boolean> {
  const row = await db.query.userDisplayPreferences.findFirst({
    where: eq(userDisplayPreferences.userId, userId),
    columns: { developerDemoMode: true },
  });
  return Boolean(row?.developerDemoMode);
}

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  await ensureLocalUser(userId);
  const existing = await db.query.userDisplayPreferences.findFirst({
    where: eq(userDisplayPreferences.userId, userId),
  });
  if (existing) {
    return rowToPreferences(existing);
  }

  const [created] = await db
    .insert(userDisplayPreferences)
    .values({
      userId,
      ...DEFAULT_USER_PREFERENCES,
    })
    .returning();
  return rowToPreferences(created);
}

/** @deprecated use updateUserPreferences */
export async function updateDisplayPreferences(
  userId: string,
  patch: Partial<UserPreferences>,
): Promise<UserPreferences> {
  return updateUserPreferences(userId, patch);
}

export async function updateUserPreferences(
  userId: string,
  patch: Partial<UserPreferences>,
): Promise<UserPreferences> {
  await ensureLocalUser(userId);
  const current = await getUserPreferences(userId);
  const merged = mergePreferences(current, patch);
  validateGlucoseTargetRange(merged.targetLowMgdl, merged.targetHighMgdl);

  const [updated] = await db
    .update(userDisplayPreferences)
    .set({
      showSteps: merged.showSteps,
      showActivity: merged.showActivity,
      showSleep: merged.showSleep,
      showFood: merged.showFood,
      ianaTimeZone: merged.ianaTimeZone,
      patternThresholdPercent: merged.patternThresholdPercent,
      targetLowMgdl: merged.targetLowMgdl,
      targetHighMgdl: merged.targetHighMgdl,
      targetTirPercent: merged.targetTirPercent,
      targetStepsPerDay: merged.targetStepsPerDay,
      developerDemoMode: merged.developerDemoMode,
      onboardingCompleted: merged.onboardingCompleted,
      updatedAt: new Date(),
    })
    .where(eq(userDisplayPreferences.userId, userId))
    .returning();

  return rowToPreferences(updated);
}
