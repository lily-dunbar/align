import { readFile } from "node:fs/promises";

import { auth } from "@clerk/nextjs/server";
import { formatInTimeZone } from "date-fns-tz";
import { NextResponse } from "next/server";

import {
  aggregateCsvForPacificYmd,
  getShortcutsCsvTimeZone,
  parseShortcutsCsvLines,
  persistDigitTotalForTodayPacific,
  persistParsedCsvLinesToDb,
} from "@/lib/integrations/health/readShortcutsSteps";
import {
  expandUserPath,
  importHourlyStepsFromJsonString,
} from "@/lib/steps/import-hourly-json-file";

function resolveStepsFilePathFromEnv(): string | null {
  const jsonPath = process.env.ICLOUD_STEPS_JSON_PATH?.trim();
  const shortcutsPath = process.env.SHORTCUTS_STEPS_FILE_PATH?.trim();
  return jsonPath || shortcutsPath || null;
}

/**
 * Import hourly steps from a local file on the machine running Next.js.
 * Supports:
 * - Apple Shortcuts `Timestamp, Steps.txt` (CSV lines: `M/D/YYYY, H:MM AM/PM, steps`) → source `shortcuts_file`
 * - JSON array / `{ samples: [...] }` with ISO timestamps → source `apple_shortcuts`
 * - Plain integer file = today's total steps (Pacific) → source `shortcuts_file`
 */
export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawPath = resolveStepsFilePathFromEnv();
  if (!rawPath) {
    return NextResponse.json(
      {
        error:
          "Set ICLOUD_STEPS_JSON_PATH and/or SHORTCUTS_STEPS_FILE_PATH in .env.local to an absolute path (Shortcuts `Timestamp, Steps.txt`, or a JSON hourly file), then restart the dev server.",
      },
      { status: 400 },
    );
  }

  const expanded = expandUserPath(rawPath);

  try {
    const text = await readFile(expanded, "utf8");
    const t = text.trim();

    if (/^\d+$/.test(t)) {
      const steps = parseInt(t, 10);
      await persistDigitTotalForTodayPacific(userId, steps);
      return NextResponse.json({
        ok: true,
        format: "digits_total_pacific",
        filePath: expanded,
        steps,
      });
    }

    if (t.startsWith("[") || t.startsWith("{")) {
      const result = await importHourlyStepsFromJsonString(userId, text);
      return NextResponse.json({
        ok: true,
        format: "json",
        filePath: expanded,
        ...result,
      });
    }

    const lines = parseShortcutsCsvLines(text);
    if (lines.length === 0) {
      return NextResponse.json(
        {
          error:
            "File is not valid JSON and has no Shortcuts CSV lines (expected `M/D/YYYY, H:MM AM/PM, steps` per line, or a JSON array of { timestamp, steps }).",
          filePath: expanded,
        },
        { status: 400 },
      );
    }

    const { inserted, updated, buckets } = await persistParsedCsvLinesToDb(userId, lines);
    const todayYmd = formatInTimeZone(new Date(), getShortcutsCsvTimeZone(), "yyyy-MM-dd");
    const agg = aggregateCsvForPacificYmd(lines, todayYmd);
    const stepsToday = agg?.totalSteps ?? 0;

    return NextResponse.json({
      ok: true,
      format: "shortcuts_csv",
      filePath: expanded,
      lineCount: lines.length,
      inserted,
      updated,
      buckets,
      stepsTodayPacific: stepsToday,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed";
    console.error("[steps/import-file]", e);
    return NextResponse.json({ error: message, filePath: expanded }, { status: 400 });
  }
}
