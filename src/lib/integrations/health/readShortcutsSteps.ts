import "server-only";

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { and, eq } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { toDate } from "date-fns-tz";

import { db } from "@/db";
import { hourlySteps, user } from "@/db/schema";

/** Default when `SHORTCUTS_STEPS_TIME_ZONE` is unset — Shortcuts CSV wall clock → UTC buckets. */
export const SHORTCUTS_APP_DAY_TIMEZONE = "America/Los_Angeles";

/**
 * IANA zone for interpreting dates/times in `Timestamp, Steps.txt` (should match the iPhone’s region).
 * The day view filters by the browser’s zone; if this env doesn’t match, a day (e.g. May 2) can look empty.
 */
export function getShortcutsCsvTimeZone(): string {
  return process.env.SHORTCUTS_STEPS_TIME_ZONE?.trim() || SHORTCUTS_APP_DAY_TIMEZONE;
}

function stripEnvPathQuotes(raw: string): string {
  let p = raw.trim();
  if (
    (p.startsWith('"') && p.endsWith('"') && p.length >= 2) ||
    (p.startsWith("'") && p.endsWith("'") && p.length >= 2)
  ) {
    p = p.slice(1, -1).trim();
  }
  return p;
}

const SHORTCUTS_ICLOUD_CONTAINER = join(
  "Library",
  "Mobile Documents",
  "iCloud~is~workflow~my~workflows",
);

/**
 * Primary default: `Timestamp, Steps.txt` in the Shortcuts iCloud folder (Finder → iCloud Drive → Shortcuts).
 * Falls back to `Documents/Timestamp, Steps.txt` in the same container (older layouts).
 * Override with SHORTCUTS_STEPS_FILE_PATH (absolute or ~/…).
 */
export const DEFAULT_SHORTCUTS_STEPS_RELATIVE_TO_HOME = join(
  SHORTCUTS_ICLOUD_CONTAINER,
  "Shortcuts",
  "Timestamp, Steps.txt",
);

function expandHomePath(raw: string): string {
  const p = stripEnvPathQuotes(raw);
  if (p.startsWith("~/")) {
    return join(homedir(), p.slice(2));
  }
  if (p === "~") return homedir();
  return p;
}

/** When env is unset, try these in order (Shortcuts folder first, then Documents). */
export function defaultShortcutsStepsAbsolutePaths(): string[] {
  const home = homedir();
  return [
    join(home, SHORTCUTS_ICLOUD_CONTAINER, "Shortcuts", "Timestamp, Steps.txt"),
    join(home, SHORTCUTS_ICLOUD_CONTAINER, "Documents", "Timestamp, Steps.txt"),
  ];
}

/** Resolved path for display / single-target use; prefer SHORTCUTS_STEPS_FILE_PATH when set. */
export function getShortcutsStepsFilePath(): string {
  const fromEnv = process.env.SHORTCUTS_STEPS_FILE_PATH?.trim();
  if (fromEnv) {
    return expandHomePath(fromEnv);
  }
  return defaultShortcutsStepsAbsolutePaths()[0];
}

export type ParsedCsvLine = {
  ymd: string;
  hour24: number;
  minute: number;
  second: number;
  steps: number;
};

const CSV_LINE =
  /^\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*,\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)\s*,\s*(\d+)\s*$/i;

function normalizeCalendarYear(y: number): number {
  if (y >= 100) return y;
  return y >= 70 ? 1900 + y : 2000 + y;
}

function hour12To24(h12: number, ap: string): number {
  const u = ap.toUpperCase();
  if (u === "AM") return h12 === 12 ? 0 : h12;
  return h12 === 12 ? 12 : h12 + 12;
}

function toYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Each non-empty line: M/D/YY or MM/DD/YYYY, H:MM or H:MM:SS AM/PM, integer steps.
 * Example: 4/30/2026, 3:45 PM, 1200
 */
export function parseShortcutsCsvLines(text: string): ParsedCsvLine[] {
  const out: ParsedCsvLine[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(CSV_LINE);
    if (!m) continue;
    const month = Number(m[1]);
    const day = Number(m[2]);
    const year = normalizeCalendarYear(Number(m[3]));
    const h12 = Number(m[4]);
    const minute = Number(m[5]);
    const second = m[6] ? Number(m[6]) : 0;
    const ap = m[7];
    const steps = Number(m[8]);
    if (!Number.isFinite(steps) || steps < 0) continue;
    const hour24 = hour12To24(h12, ap);
    out.push({
      ymd: toYmd(year, month, day),
      hour24,
      minute,
      second,
      steps: Math.round(steps),
    });
  }
  return out;
}

/** CSV calendar + local hour on each line → UTC (uses {@link getShortcutsCsvTimeZone}). */
export function pacificWallToUtc(
  ymd: string,
  hour24: number,
  minute = 0,
  second = 0,
): Date {
  const [y, mo, d] = ymd.split("-").map(Number);
  const wall = `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}.000`;
  return toDate(wall, { timeZone: getShortcutsCsvTimeZone() });
}

export function aggregateCsvForPacificYmd(
  lines: ParsedCsvLine[],
  dateYmd: string,
): { hourly: number[]; totalSteps: number } | null {
  const hourly = new Array<number>(24).fill(0);
  let any = false;
  for (const row of lines) {
    if (row.ymd !== dateYmd) continue;
    any = true;
    hourly[row.hour24] += row.steps;
  }
  if (!any) return null;
  const totalSteps = hourly.reduce((a, b) => a + b, 0);
  return { hourly, totalSteps };
}

async function ensureLocalUserRow(userId: string) {
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

const SOURCE_SHORTCUTS_FILE = "shortcuts_file";

/**
 * Upsert hourly buckets from CSV lines (wall clock in {@link getShortcutsCsvTimeZone}).
 * Multiple lines in the same clock hour add together before one upsert per bucket.
 */
export async function persistParsedCsvLinesToDb(
  userId: string,
  lines: ParsedCsvLine[],
): Promise<{ inserted: number; updated: number; buckets: number }> {
  await ensureLocalUserRow(userId);

  const bucketMap = new Map<string, { bucketStart: Date; steps: number }>();
  for (const row of lines) {
    const bucketStart = pacificWallToUtc(row.ymd, row.hour24, 0, 0);
    const key = bucketStart.toISOString();
    const prev = bucketMap.get(key);
    const steps = (prev?.steps ?? 0) + row.steps;
    bucketMap.set(key, { bucketStart, steps });
  }

  let inserted = 0;
  let updated = 0;
  for (const { bucketStart, steps } of bucketMap.values()) {
    const existing = await db.query.hourlySteps.findFirst({
      where: and(
        eq(hourlySteps.userId, userId),
        eq(hourlySteps.bucketStart, bucketStart),
        eq(hourlySteps.source, SOURCE_SHORTCUTS_FILE),
      ),
      columns: { id: true },
    });
    if (existing) {
      await db
        .update(hourlySteps)
        .set({
          stepCount: steps,
          receivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(hourlySteps.id, existing.id));
      updated += 1;
    } else {
      await db.insert(hourlySteps).values({
        userId,
        bucketStart,
        stepCount: steps,
        source: SOURCE_SHORTCUTS_FILE,
        receivedAt: new Date(),
      });
      inserted += 1;
    }
  }
  return { inserted, updated, buckets: bucketMap.size };
}

/** Legacy: file is a single integer = today’s total steps (no hourly breakdown). */
export async function persistDigitTotalForTodayPacific(
  userId: string,
  totalSteps: number,
): Promise<void> {
  await ensureLocalUserRow(userId);
  const todayYmd = formatInTimeZone(new Date(), getShortcutsCsvTimeZone(), "yyyy-MM-dd");
  const bucketStart = pacificWallToUtc(todayYmd, 0, 0, 0);
  const existing = await db.query.hourlySteps.findFirst({
    where: and(
      eq(hourlySteps.userId, userId),
      eq(hourlySteps.bucketStart, bucketStart),
      eq(hourlySteps.source, SOURCE_SHORTCUTS_FILE),
    ),
    columns: { id: true },
  });
  if (existing) {
    await db
      .update(hourlySteps)
      .set({
        stepCount: Math.max(0, Math.round(totalSteps)),
        receivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(hourlySteps.id, existing.id));
  } else {
    await db.insert(hourlySteps).values({
      userId,
      bucketStart,
      stepCount: Math.max(0, Math.round(totalSteps)),
      source: SOURCE_SHORTCUTS_FILE,
      receivedAt: new Date(),
    });
  }
}

export type ReadShortcutsStepsResult =
  | { ok: true; steps: number; source: "shortcuts-file"; filePath: string; lineCount?: number }
  | { ok: false; error: string; filePath: string };

export async function readShortcutsFileText(): Promise<
  | { ok: true; text: string; filePath: string }
  | { ok: false; error: string; filePath: string }
> {
  const fromShortcuts = process.env.SHORTCUTS_STEPS_FILE_PATH?.trim();
  const fromIcloudOrJson = process.env.ICLOUD_STEPS_JSON_PATH?.trim();
  const candidates: string[] = [];
  if (fromShortcuts) candidates.push(expandHomePath(fromShortcuts));
  if (fromIcloudOrJson) candidates.push(expandHomePath(fromIcloudOrJson));
  if (candidates.length === 0) {
    candidates.push(...defaultShortcutsStepsAbsolutePaths());
  }

  const tried: string[] = [];
  let lastError = "File not found";
  for (const filePath of candidates) {
    tried.push(filePath);
    try {
      const text = await readFile(filePath, "utf8");
      return { ok: true, text, filePath };
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      lastError = err.code === "ENOENT" ? "File not found" : (err.message ?? String(e));
    }
  }

  const hint =
    fromShortcuts || fromIcloudOrJson
      ? lastError
      : `${lastError}. Tried:\n${tried.map((p) => `  • ${p}`).join("\n")}`;
  return {
    ok: false,
    error: hint,
    filePath: tried[0] ?? getShortcutsStepsFilePath(),
  };
}

/**
 * Hourly buckets (0–23) and total for one Pacific calendar day (YYYY-MM-DD),
 * matching the date column in the file (Pacific day model from handoff).
 */
export async function readShortcutsStepsForPacificDay(dateYmd: string): Promise<{
  hourly: number[];
  totalSteps: number;
} | null> {
  const file = await readShortcutsFileText();
  if (!file.ok) return null;
  const t = file.text.trim();
  if (/^\d+$/.test(t)) return null;
  const lines = parseShortcutsCsvLines(file.text);
  return aggregateCsvForPacificYmd(lines, dateYmd);
}

/**
 * Read the Shortcuts file from disk. Digits-only → today’s total; CSV → sum for **today Pacific**.
 */
export async function readShortcutsSteps(): Promise<ReadShortcutsStepsResult> {
  const file = await readShortcutsFileText();
  if (!file.ok) {
    return { ok: false, error: file.error, filePath: file.filePath };
  }

  const t = file.text.trim();
  if (/^\d+$/.test(t)) {
    return {
      ok: true,
      steps: parseInt(t, 10),
      source: "shortcuts-file",
      filePath: file.filePath,
    };
  }

  const lines = parseShortcutsCsvLines(file.text);
  if (lines.length === 0) {
    return {
      ok: false,
      error: "No parsable CSV lines (expected M/D/YYYY, H:MM AM/PM, steps)",
      filePath: file.filePath,
    };
  }

  const todayYmd = formatInTimeZone(new Date(), getShortcutsCsvTimeZone(), "yyyy-MM-dd");
  const agg = aggregateCsvForPacificYmd(lines, todayYmd);
  const steps = agg?.totalSteps ?? 0;
  return {
    ok: true,
    steps,
    source: "shortcuts-file",
    filePath: file.filePath,
    lineCount: lines.length,
  };
}

export type SyncShortcutsFileResult = ReadShortcutsStepsResult & {
  inserted?: number;
  updated?: number;
  buckets?: number;
};

/** Read Shortcuts file from disk and persist into hourly_steps (shortcuts_file source). */
export async function syncShortcutsStepsFromDiskToDb(userId: string): Promise<SyncShortcutsFileResult> {
  const file = await readShortcutsFileText();
  if (!file.ok) {
    return { ok: false, error: file.error, filePath: file.filePath };
  }

  const t = file.text.trim();
  if (/^\d+$/.test(t)) {
    const steps = parseInt(t, 10);
    await persistDigitTotalForTodayPacific(userId, steps);
    return {
      ok: true,
      steps,
      source: "shortcuts-file",
      filePath: file.filePath,
    };
  }

  const lines = parseShortcutsCsvLines(file.text);
  if (lines.length === 0) {
    return {
      ok: false,
      error: "No parsable CSV lines (expected M/D/YYYY, H:MM AM/PM, steps)",
      filePath: file.filePath,
    };
  }

  const { inserted, updated, buckets } = await persistParsedCsvLinesToDb(userId, lines);
  const todayYmd = formatInTimeZone(new Date(), getShortcutsCsvTimeZone(), "yyyy-MM-dd");
  const agg = aggregateCsvForPacificYmd(lines, todayYmd);
  const steps = agg?.totalSteps ?? 0;

  return {
    ok: true,
    steps,
    source: "shortcuts-file",
    filePath: file.filePath,
    lineCount: lines.length,
    inserted,
    updated,
    buckets,
  };
}
