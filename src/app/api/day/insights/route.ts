import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { DEMO_DAY_INSIGHTS } from "@/lib/demo/demo-day-insights";
import { isDemoDataActive } from "@/lib/demo/is-demo-data-active";
import { buildDailySparkInsight } from "@/lib/day-insight-daily-spark";
import { loadDayInsightSnapshot } from "@/lib/day-insight-context";
import { digestDayInsightSnapshot } from "@/lib/day-insight-digest";
import { fetchDayInsightsWithClaude } from "@/lib/day-insights-llm";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
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

    const snapshot = await loadDayInsightSnapshot(userId, date, timeZone);
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

    if (await isDemoDataActive(userId)) {
      return NextResponse.json({
        ok: true,
        source: "demo" as const,
        insights: [spark, ...DEMO_DAY_INSIGHTS],
        generatedAt: new Date().toISOString(),
        date,
        timeZone,
        digest,
      });
    }

    const outcome = await fetchDayInsightsWithClaude(snapshot);

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
