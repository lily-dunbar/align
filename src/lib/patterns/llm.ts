import "server-only";

import { getAnthropicClientOrNull } from "@/lib/anthropic/client";
import type {
  PatternFeatureContext,
  PatternInsightJson,
  PatternTypeLabel,
  PatternWindow,
} from "@/lib/patterns/types";

/** Default: current Sonnet on the Messages API — override with `ANTHROPIC_MODEL` if needed. */
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

/** Maps LLM output. Day-level movement vs glucose maps to Steps (not Sessions). */
function normalizeType(raw: unknown): PatternTypeLabel | null {
  if (typeof raw !== "string") return null;
  const u = raw.trim().toLowerCase();
  if (u === "temporal") return "Temporal";
  if (u === "steps" || u === "step" || u === "day_activity" || u === "activity_days") {
    return "Steps";
  }
  if (
    u === "sessions" ||
    u === "session" ||
    u === "workout" ||
    u === "workouts" ||
    u === "run" ||
    u === "runs"
  ) {
    return "Sessions";
  }
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
 * Calls Claude with {@link PatternFeatureContext}. Temporal, Sessions, and Steps
 * (day-level step totals vs glucose only). Plain-language, patient-facing copy.
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
      system: `You analyze ONE rolling window of personal Dexcom glucose data + workout + daily movement data (JSON). No diagnosis, treatment, or dosing advice.

**Output types — exactly three:**
- **Temporal** — Dexcom glucose vs clock time or weekday/weekend. When temporal.dinnerEveningVsMorningDeltaMgdl is sizable, prefer a **6–9pm vs morning** headline with **~X mg/dL** rounded (use the delta magnitude from JSON; say "higher" or "lower" correctly).
- **Sessions** — Dexcom glucose vs **logged** workouts (Strava/manual). When sessions.runLikeSessionsDeltaOverLongRunMi ≥ 2 and deltas exist, use a **short title** (no mg/dL in the title): e.g. "Slight BG drop on runs", "BG drop on longer runs", "Slight BG rise on runs", based on typical size of |avgMgdlDeltaRunLikeOverLongRunMi| (slight ≈ under ~16 mg/dL, large ≈ 40+). Put numbers only in **description**, e.g. "Blood sugars tend to drop by about 45–65 mg/dL on runs over 2 mi in this window (during vs ~90 minutes before start)…" Use deltaMgdlP25LongRunMi–P75 as a **positive magnitude span** for drops (e.g. −50 to −66 ⇒ "50–66"), never "rises" with negative numbers. Runs **≥ sessions.longRunMilesThreshold** miles. Negative delta = drop; positive = rise.
- **Steps** — **Only** mean daily glucose on days with daily steps ≥ steps.activeDayStepsThreshold vs days below it (use meanDailyMgdlStepsGteThreshold, meanDailyMgdlStepsLtThreshold, meanMgdlDeltaLessActiveMinusActive). **Forbidden:** hourly step curves, "high-step hours," or generic Steps without that day-threshold split.

**Quantification (whenever the JSON numbers exist):** Descriptions should state **approximate mg/dL** and the **rule** (e.g. runs over ~2 mi, step threshold). **Exception:** long-run **Sessions** card titles stay qualitative (no mg/dL in title)—numbers belong in the description. Temporal/Steps titles may still use ~X mg/dL when helpful. Round to whole mg/dL. Do not invent numbers — only use fields provided (you may summarize P25–P75 as a span).

**Voice:** Lead with the finding; 1–2 sentences; tentative language for causes. No sample counts, no method jargon ("p25," "cohort"), no ± window labels. Prefer **Dexcom** or **Dexcom data** in user-facing wording—do not say CGM or continuous glucose monitor.

**confidencePercent** — 0–100 for ranking; **linkedSources** — "Dexcom", "Strava", "Manual workouts", "Apple Steps" if hourly step data informed the day totals.

Return **2–4 patterns total**, distinct angles. Prefer this mix when supported: one **Temporal** (evening vs morning if delta is clear), one **Sessions** (long-run Δ if present), one **Steps** (threshold days if steps.meanMgdlDeltaLessActiveMinusActive is meaningful). Skip types the JSON cannot support.

If evidence is thin, return fewer patterns or {"patterns":[]} — never pad.

Schema (always return this shape):
{"patterns":[{"id":"slug","title":"…","description":"…","type":"Temporal"|"Sessions"|"Steps","confidencePercent":0-100,"linkedSources":["dexcom"]}]}

If nothing defensible, return {"patterns":[]}.`,
      messages: [
        {
          role: "user",
          content: `Window: ${args.window}

Follow dataCoverage.analysisHint. Stats JSON:
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
