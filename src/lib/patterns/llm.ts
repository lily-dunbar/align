import "server-only";

import { getAnthropicClientOrNull } from "@/lib/anthropic/client";
import type {
  PatternFeatureContext,
  PatternInsightJson,
  PatternTypeLabel,
  PatternWindow,
} from "@/lib/patterns/types";

/** Default: Claude Sonnet 4 — override with `ANTHROPIC_MODEL` if your workspace uses another release. */
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

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

/** Maps LLM output. Steps = daily/hourly step volume; Sessions = workouts (manual + Strava). */
function normalizeType(raw: unknown): PatternTypeLabel | null {
  if (typeof raw !== "string") return null;
  const u = raw.trim().toLowerCase();
  if (u === "temporal") return "Temporal";
  if (u === "steps" || u === "step") return "Steps";
  if (
    u === "sessions" ||
    u === "session" ||
    u === "workout" ||
    u === "workouts" ||
    u === "activity"
  )
    return "Sessions";
  return null;
}

function parseLinkedSources(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) out.push(item.trim());
  }
  return out.length ? out : null;
}

function parsePatternItem(raw: unknown, index: number): PatternInsightJson | null {
  if (!isRecord(raw)) return null;
  const title = raw.title;
  const description = raw.description ?? raw.detail;
  const type = normalizeType(raw.type ?? raw.axis);
  const confidenceRaw =
    raw.confidencePercent ?? raw.frequencyPercent ?? raw.strength;
  if (typeof title !== "string" || title.length < 2) return null;
  if (typeof description !== "string" || description.length < 4) return null;
  if (!type) return null;
  if (typeof confidenceRaw !== "number" || !Number.isFinite(confidenceRaw)) return null;
  const conf = Math.max(0, Math.min(100, Math.round(confidenceRaw)));
  let linkedSources = parseLinkedSources(raw.linkedSources);
  if (!linkedSources && typeof raw.linkedSources === "string") {
    linkedSources = [raw.linkedSources.trim()].filter(Boolean);
  }
  if (!linkedSources?.length) {
    linkedSources = ["Dexcom"];
  }
  const id =
    typeof raw.id === "string" && raw.id.length > 0
      ? raw.id
      : `llm-${index}-${conf}`;
  return {
    id,
    title: title.slice(0, 200),
    description: description.slice(0, 1200),
    type,
    confidencePercent: conf,
    linkedSources,
  };
}

export type FetchLlmPatternsOutcome =
  | { kind: "unavailable" }
  | { kind: "failed" }
  /** Valid JSON with a patterns array (may be empty). */
  | { kind: "ok"; patterns: PatternInsightJson[] };

/**
 * Calls Claude with full {@link PatternFeatureContext} (BG aggregates, steps stats, session/workout stats).
 * Returns `ok` with an empty array when the model concludes there are no patterns.
 */
export async function fetchLlmPatterns(args: {
  window: PatternWindow;
  context: PatternFeatureContext;
}): Promise<FetchLlmPatternsOutcome> {
  const client = getAnthropicClientOrNull();
  if (!client) return { kind: "unavailable" };

  const statsJson = JSON.stringify(args.context, null, 2);

  try {
    const msg = await client.messages.create({
      model: modelId(),
      max_tokens: 4096,
      system: `You are analyzing ONE rolling period of personal CGM + movement + workout aggregates (JSON below). No diagnosis, treatment, or dosing advice.

You MUST reason across ALL streams before emitting patterns:
1. **BG / CGM** — temporal.* (hourly bands, weekday vs weekend, peaks/troughs, evening highs), glucoseReadingsCount, meanMgdl, tir.
2. **Steps** — hourly buckets → steps.* (avg daily steps, high- vs low-step days vs mean glucose, goals).
3. **Activity / workouts** — sessions.* (manual + Strava counts; CGM near workouts vs away; before/during deltas for run-like sessions).

Compare domains (e.g., weekend BG vs weekday BG vs step volume; workout days vs glucose; high-step days vs low-step days). Prefer insights that relate TWO domains when dataCoverage counts show multiple streams exist.

Schema (always return this shape):
{"patterns":[{"id":"slug","title":"informative headline","description":"2–4 sentences","type":"Temporal"|"Steps"|"Sessions","confidencePercent":0-100,"linkedSources":["Dexcom"]}]}

If after reviewing temporal.*, steps.*, and sessions.* you identify NO supported comparative patterns, return exactly {"patterns":[]}.

**title (required style)**
One line, 12–120 characters. Comparative when evidence supports it (see prior examples in product rules).

**type**
- **Temporal** — BG vs clock / calendar (temporal.*).
- **Steps** — BG vs step-count / daily movement (steps.* only — NOT workouts).
- **Sessions** — BG vs workouts / structured activity (sessions.*). Use "Sessions" for workout-related findings; do NOT use type Steps for workouts.

**confidencePercent** — evidence strength for this window (0–100).

**linkedSources** — Dexcom when CGM is cited; Apple Steps when steps.* cited; Strava / Manual workouts when sessions.* cited.

At most 3 patterns per type (≤9 total).`,
      messages: [
        {
          role: "user",
          content: `Window: ${args.window}

Confirm you considered dataCoverage (counts per stream) plus temporal, steps, and sessions sections. Compare BG vs steps vs workout activity where counts allow.

Stats JSON:
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
    if (!isRecord(parsed) || !Array.isArray(parsed.patterns)) return { kind: "failed" };

    const out: PatternInsightJson[] = [];
    let i = 0;
    for (const item of parsed.patterns) {
      const row = parsePatternItem(item, i);
      if (row) out.push(row);
      i += 1;
    }
    return { kind: "ok", patterns: out };
  } catch {
    return { kind: "failed" };
  }
}
