import "server-only";

import { cache } from "react";

import { and, asc, eq, gte, lt } from "drizzle-orm";

import { buildDemoPatternWindowSummaries } from "@/lib/demo/build-demo-window-summaries";
import { isDemoDataActive } from "@/lib/demo/is-demo-data-active";
import { db } from "@/db";
import { glucoseReadings, hourlySteps } from "@/db/schema";
import { mergeHourlyStepsPreferShortcutsFile } from "@/lib/merge-hourly-steps-sources";
import type { PatternWindow } from "@/lib/patterns/types";
import { rollingRangeUtc } from "@/lib/patterns/window";
import { calculateTir, type GlucosePoint } from "@/lib/tir";
import { getUserPreferences } from "@/lib/user-display-preferences";

export type PatternPeriodSummary = {
  avgGlucoseMgdl: number | null;
  tirInRangePercent: number | null;
  /** Mean daily steps: total steps ÷ window days (same length as selected range). */
  avgStepsPerDay: number;
  glucoseReadingsCount: number;
  totalSteps: number;
};

export type PatternWindowSummaryResult = {
  window: PatternWindow;
  labelDays: number;
  current: PatternPeriodSummary;
  previous: PatternPeriodSummary;
};

async function aggregatePeriod(
  userId: string,
  startUtc: Date,
  endUtcExclusive: Date,
  labelDays: number,
  targetLowMgdl: number,
  targetHighMgdl: number,
): Promise<PatternPeriodSummary> {
  const [glucoseRows, stepRows] = await Promise.all([
    db.query.glucoseReadings.findMany({
      where: and(
        eq(glucoseReadings.userId, userId),
        gte(glucoseReadings.observedAt, startUtc),
        lt(glucoseReadings.observedAt, endUtcExclusive),
      ),
      orderBy: [asc(glucoseReadings.observedAt)],
      columns: { observedAt: true, mgdl: true },
    }),
    db.query.hourlySteps.findMany({
      where: and(
        eq(hourlySteps.userId, userId),
        gte(hourlySteps.bucketStart, startUtc),
        lt(hourlySteps.bucketStart, endUtcExclusive),
      ),
      orderBy: [asc(hourlySteps.bucketStart)],
      columns: { bucketStart: true, stepCount: true, source: true, receivedAt: true },
    }),
  ]);

  const points: GlucosePoint[] = glucoseRows.map((g) => ({
    observedAt: g.observedAt,
    mgdl: g.mgdl,
  }));

  let avgGlucoseMgdl: number | null = null;
  let tirInRangePercent: number | null = null;

  if (points.length > 0) {
    avgGlucoseMgdl = Math.round(
      points.reduce((sum, p) => sum + p.mgdl, 0) / points.length,
    );
    const tir = calculateTir(points, { targetLowMgdl, targetHighMgdl });
    tirInRangePercent =
      tir.totalPoints > 0 ? tir.inRangePercent : null;
  }

  const stepsMerged = mergeHourlyStepsPreferShortcutsFile(stepRows);
  const totalSteps = stepsMerged.reduce((sum, r) => sum + r.stepCount, 0);
  const avgStepsPerDay =
    labelDays > 0 ? Math.round(totalSteps / labelDays) : 0;

  return {
    avgGlucoseMgdl,
    tirInRangePercent,
    avgStepsPerDay,
    glucoseReadingsCount: points.length,
    totalSteps,
  };
}

/** Deduped for parallel RSC loaders — pass the same `atIso` as patterns feature when applicable. */
export const getPatternWindowSummariesForIso = cache(
  async (
    userId: string,
    window: PatternWindow,
    atIso: string,
  ): Promise<PatternWindowSummaryResult> => {
    return getPatternWindowSummariesImpl(userId, window, new Date(atIso));
  },
);

/**
 * Rolling window [now − N days, now) vs the immediately prior window of the same length.
 */
export async function getPatternWindowSummaries(
  userId: string,
  window: PatternWindow,
  at: Date = new Date(),
): Promise<PatternWindowSummaryResult> {
  return getPatternWindowSummariesForIso(userId, window, at.toISOString());
}

async function getPatternWindowSummariesImpl(
  userId: string,
  window: PatternWindow,
  at: Date,
): Promise<PatternWindowSummaryResult> {
  const { startUtc: curStart, endUtcExclusive: curEnd, labelDays } = rollingRangeUtc(
    window,
    at,
  );

  if (await isDemoDataActive(userId)) {
    return buildDemoPatternWindowSummaries(window, labelDays);
  }

  const prefs = await getUserPreferences(userId);
  const prevEndExclusive = curStart;
  const prevStart = new Date(
    at.getTime() - 2 * labelDays * 24 * 60 * 60 * 1000,
  );

  const [current, previous] = await Promise.all([
    aggregatePeriod(
      userId,
      curStart,
      curEnd,
      labelDays,
      prefs.targetLowMgdl,
      prefs.targetHighMgdl,
    ),
    aggregatePeriod(
      userId,
      prevStart,
      prevEndExclusive,
      labelDays,
      prefs.targetLowMgdl,
      prefs.targetHighMgdl,
    ),
  ]);

  return {
    window,
    labelDays,
    current,
    previous,
  };
}
