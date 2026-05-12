import { auth } from "@clerk/nextjs/server";
import { revalidateTag, unstable_cache } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { buildDemoDayInsights } from "@/lib/demo/demo-day-insights";
import { isDemoDataActive } from "@/lib/demo/is-demo-data-active";
import { PUBLIC_DEMO_USER_ID } from "@/lib/demo/public-demo";
import { isDemoRequest } from "@/lib/demo/request-mode";
import { buildDailySparkInsight } from "@/lib/day-insight-daily-spark";
import { loadDayInsightSnapshot } from "@/lib/day-insight-context";
import { digestDayInsightSnapshot } from "@/lib/day-insight-digest";
import { fetchDayInsightsWithClaude, type DayInsightsLlmOutcome } from "@/lib/day-insights-llm";

function dayInsightsLlmCacheTag(userId: string, date: string, timeZone: string) {
  return `day-insights-llm:${userId}:${date}:${timeZone}`;
}

function getCachedDayInsightsLlmOutcome(userId: string, date: string, timeZone: string) {
  return unstable_cache(
    async (): Promise<DayInsightsLlmOutcome> => {
      const snap = await loadDayInsightSnapshot(userId, date, timeZone);
      return fetchDayInsightsWithClaude(snap);
    },
    ["align-day-insights-llm-v1", userId, date, timeZone],
    { tags: [dayInsightsLlmCacheTag(userId, date, timeZone)], revalidate: false },
  );
}

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  const demoMode = isDemoRequest(request);
  const effectiveUserId = userId ?? (demoMode ? PUBLIC_DEMO_USER_ID : null);
  if (!effectiveUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const timeZone = url.searchParams.get("timeZone") ?? "UTC";

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  try {
    const sinceDigest = url.searchParams.get("sinceDigest")?.trim() ?? "";

    const snapshot = await loadDayInsightSnapshot(effectiveUserId, date, timeZone);
    const digest = digestDayInsightSnapshot(snapshot);

    if (sinceDigest && sinceDigest === digest) {
      return NextResponse.json({
        ok: true,
        unchanged: true as const,
        digest,
        date,
        timeZone,
      });
    }

    const spark = buildDailySparkInsight({ ...snapshot, dateYmd: date });

    if (await isDemoDataActive(effectiveUserId)) {
      return NextResponse.json({
        ok: true,
        source: "demo" as const,
        insights: [spark, ...buildDemoDayInsights(snapshot)],
        generatedAt: new Date().toISOString(),
        date,
        timeZone,
        digest,
      });
    }

    const forceRefresh = url.searchParams.get("refresh") === "1";
    if (forceRefresh) {
      revalidateTag(dayInsightsLlmCacheTag(effectiveUserId, date, timeZone), "max");
    }

    const outcome = await getCachedDayInsightsLlmOutcome(effectiveUserId, date, timeZone)();

    if (outcome.kind === "unavailable") {
      return NextResponse.json({
        ok: true,
        source: "spark" as const,
        insights: [spark],
        message: "Set ANTHROPIC_API_KEY for extra Claude takeaways on top of this daily note.",
        generatedAt: new Date().toISOString(),
        date,
        timeZone,
        digest,
      });
    }

    if (outcome.kind === "failed") {
      return NextResponse.json({
        ok: true,
        source: "spark" as const,
        insights: [spark],
        message: "Claude had a hiccup — you still get today’s note.",
        generatedAt: new Date().toISOString(),
        date,
        timeZone,
        digest,
      });
    }

    const merged = [spark, ...outcome.insights].slice(0, 6);

    return NextResponse.json({
      ok: true,
      source: "anthropic" as const,
      insights: merged,
      generatedAt: new Date().toISOString(),
      date,
      timeZone,
      digest,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load day insights";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
