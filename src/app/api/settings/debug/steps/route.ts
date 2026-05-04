import { desc, eq, sql } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { hourlySteps, stepIngestTokens } from "@/db/schema";

function appBaseUrl() {
  return (process.env.AUTH_URL ?? "http://localhost:4000").replace(/\/$/, "");
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tokenRow = await db.query.stepIngestTokens.findFirst({
    where: eq(stepIngestTokens.userId, userId),
    columns: { token: true, createdAt: true, updatedAt: true },
  });

  const base = appBaseUrl();

  const [agg] = await db
    .select({
      bucketRows: sql<number>`count(*)::int`,
      stepSum: sql<number>`coalesce(sum(${hourlySteps.stepCount}), 0)::int`,
    })
    .from(hourlySteps)
    .where(eq(hourlySteps.userId, userId));

  const recent = await db.query.hourlySteps.findMany({
    where: eq(hourlySteps.userId, userId),
    orderBy: [desc(hourlySteps.bucketStart)],
    limit: 20,
    columns: {
      bucketStart: true,
      stepCount: true,
      source: true,
      receivedAt: true,
    },
  });

  const bySource = await db
    .select({
      source: hourlySteps.source,
      rows: sql<number>`count(*)::int`,
      steps: sql<number>`coalesce(sum(${hourlySteps.stepCount}), 0)::int`,
    })
    .from(hourlySteps)
    .where(eq(hourlySteps.userId, userId))
    .groupBy(hourlySteps.source);

  return NextResponse.json({
    ingest: {
      configured: !!tokenRow,
      sharedSecretConfigured: !!(
        process.env.STEPS_INGEST_SECRET?.trim() ||
        process.env.STEPS_TOKEN_SECRET?.trim() ||
        process.env.AUTH_SECRET?.trim()
      ),
      tokenCreatedAt: tokenRow?.createdAt.toISOString() ?? null,
      tokenUpdatedAt: tokenRow?.updatedAt.toISOString() ?? null,
      /** Path-only hint so the token is not leaked in JSON. */
      ingestPath: tokenRow ? "/api/ingest/steps/[your-token]" : null,
      fullUrlExample: tokenRow
        ? `${base}/api/ingest/steps/${tokenRow.token}`
        : null,
    },
    database: {
      hourlyBucketRows: agg?.bucketRows ?? 0,
      totalStepsStored: agg?.stepSum ?? 0,
      bySource,
    },
    recentBuckets: recent.map((r) => ({
      bucketStart: r.bucketStart.toISOString(),
      stepCount: r.stepCount,
      source: r.source,
      receivedAt: r.receivedAt.toISOString(),
    })),
  });
}
