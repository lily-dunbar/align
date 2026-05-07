import { desc, eq, sum } from "drizzle-orm";

import type { IntegrationSnapshot } from "@/components/settings-integrations";
import { db } from "@/db";
import { hourlySteps, stepIngestTokens } from "@/db/schema";

/** Latest Apple Steps aggregates for Settings / Pull — single source for server components and GET API. */
export async function getStepsIntegrationSnapshot(
  userId: string,
): Promise<IntegrationSnapshot["steps"]> {
  const stepTok = await db.query.stepIngestTokens.findFirst({
    where: eq(stepIngestTokens.userId, userId),
    columns: { token: true },
  });

  const lastStepsRow = await db.query.hourlySteps.findFirst({
    where: eq(hourlySteps.userId, userId),
    orderBy: [desc(hourlySteps.receivedAt)],
    columns: {
      receivedAt: true,
      bucketStart: true,
      stepCount: true,
      source: true,
    },
  });

  const recentStepRows = await db.query.hourlySteps.findMany({
    where: eq(hourlySteps.userId, userId),
    orderBy: [desc(hourlySteps.receivedAt)],
    limit: 96,
    columns: {
      bucketStart: true,
      stepCount: true,
      source: true,
      receivedAt: true,
    },
  });

  const [stepsSumAgg] = await db
    .select({ total: sum(hourlySteps.stepCount) })
    .from(hourlySteps)
    .where(eq(hourlySteps.userId, userId));

  const lastIngestAt = lastStepsRow?.receivedAt.toISOString() ?? null;
  const lastStored =
    lastStepsRow != null
      ? {
          bucketStartIso: lastStepsRow.bucketStart.toISOString(),
          stepCount: lastStepsRow.stepCount,
          source: lastStepsRow.source,
          receivedAtIso: lastStepsRow.receivedAt.toISOString(),
        }
      : null;

  return {
    connected: !!stepTok,
    lastIngestAt,
    stepsTotalStored: Number(stepsSumAgg?.total ?? 0),
    lastStored,
    recentRows: recentStepRows.map((r) => ({
      bucketStartIso: r.bucketStart.toISOString(),
      stepCount: r.stepCount,
      source: r.source,
      receivedAtIso: r.receivedAt.toISOString(),
    })),
  };
}
