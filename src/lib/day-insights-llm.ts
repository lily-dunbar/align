import "server-only";

import { getAnthropicClientOrNull } from "@/lib/anthropic/client";
import type { DayInsightSnapshot } from "@/lib/day-insight-context";

const DEFAULT_MODEL = "claude-sonnet-4-6";

function modelId() {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1]!.trim() : trimmed;
  return JSON.parse(raw) as unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

export type DayInsightItem = {
  title: string;
  detail: string;
};

export type DayInsightsLlmOutcome =
  | { kind: "unavailable" }
  | { kind: "failed" }
  | { kind: "ok"; insights: DayInsightItem[] };

/**
 * Claude review of a single calendar day snapshot (CGM + steps + workouts + food + sleep counts).
 * No diagnosis, treatment, or dosing advice.
 */
export async function fetchDayInsightsWithClaude(
  snapshot: DayInsightSnapshot,
): Promise<DayInsightsLlmOutcome> {
  const client = getAnthropicClientOrNull();
  if (!client) return { kind: "unavailable" };

  const statsJson = JSON.stringify(snapshot, null, 2);

  try {
    const msg = await client.messages.create({
      model: modelId(),
      max_tokens: 2048,
      system: `You review ONE calendar day of personal health telemetry (JSON): CGM summaries, hourly step totals, workouts (manual + Strava), food, sleep.

Rules:
- No diagnosis, treatment, medication, or dosing advice.
- The app **prepends** a separate playful "daily spark" card; you supply **only follow-up** observations.
- Output ONLY valid JSON with shape: {"insights":[{"title":"short headline","detail":"1–3 sentences"}]}
- **1–4 additional insights** (not 5). Do not repeat calendar puns or the same "daily spark" tone — be specific to the JSON streams (steps shape, workouts, food, sleep, CGM).
- If almost no extra telemetry beyond what the spark already covers, return {"insights":[]} (an empty array is OK).
- Titles ≤ 100 chars; details ≤ 500 chars each.
- aggregates.stravaDistanceMi is total Strava distance that day in **miles** (not km).`,
      messages: [
        {
          role: "user",
          content: `Day snapshot (local calendar day in timeZone; hourlyStepsByLocalHour is 24 integers, local hours 0–23):

${statsJson}`,
        },
      ],
    });

    let text = "";
    for (const block of msg.content) {
      if (block.type === "text") {
        text += block.text;
      }
    }
    text = text.trim();
    if (!text) return { kind: "failed" };

    const parsed = extractJsonObject(text);
    if (!isRecord(parsed) || !Array.isArray(parsed.insights)) return { kind: "failed" };

    const out: DayInsightItem[] = [];
    for (const item of parsed.insights) {
      if (!isRecord(item)) continue;
      const title = item.title;
      const detail = item.detail;
      if (typeof title !== "string" || title.length < 2) continue;
      if (typeof detail !== "string" || detail.length < 4) continue;
      out.push({
        title: title.slice(0, 120),
        detail: detail.slice(0, 600),
      });
      if (out.length >= 4) break;
    }
    return { kind: "ok", insights: out };
  } catch {
    return { kind: "failed" };
  }
}
