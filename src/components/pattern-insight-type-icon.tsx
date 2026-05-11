import type { ReactNode } from "react";

import type { PatternInsightJson } from "@/lib/patterns/types";

export type PatternInsightVisualKind = "temporal" | "temporal-meal" | "steps" | "sessions";

const MEALISH_TITLE = /\b(lunch|breakfast|dinner|snack|meal|food|carb|carbs|eaten|eating)\b/i;
const MEALISH_ID = /meal|lunch|food|breakfast|dinner|snack|carb/i;

export function getPatternInsightVisualKind(
  pattern: Pick<PatternInsightJson, "id" | "type" | "title">,
): PatternInsightVisualKind {
  if (pattern.type === "Sessions") return "sessions";
  if (pattern.type === "Steps") return "steps";
  if (MEALISH_TITLE.test(pattern.title) || MEALISH_ID.test(pattern.id)) return "temporal-meal";
  return "temporal";
}

function ariaLabel(kind: PatternInsightVisualKind): string {
  switch (kind) {
    case "temporal":
      return "Time-of-day pattern";
    case "temporal-meal":
      return "Meal timing pattern";
    case "steps":
      return "Daily steps and activity pattern";
    case "sessions":
      return "Workout session pattern";
    default:
      return "Pattern";
  }
}

type IconProps = { className?: string };

function IconClock({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
    </svg>
  );
}

/** Clock with a small plate dot — meal-adjacent temporal patterns. */
function IconTemporalMeal({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
      <circle cx="12" cy="17.25" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconStepsBars({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function IconWorkoutBolt({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3.75 13.5 14.25 2.25 12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

type Props = {
  pattern: Pick<PatternInsightJson, "id" | "type" | "title">;
  className?: string;
};

/**
 * Visual for pattern taxonomy: Temporal (clock), meal-flavored Temporal, day-level Steps, workout Sessions.
 */
export function PatternInsightTypeIcon({ pattern, className = "h-6 w-6" }: Props) {
  const kind = getPatternInsightVisualKind(pattern);
  const label = ariaLabel(kind);
  let body: ReactNode;
  switch (kind) {
    case "temporal-meal":
      body = <IconTemporalMeal className={className} />;
      break;
    case "steps":
      body = <IconStepsBars className={className} />;
      break;
    case "sessions":
      body = <IconWorkoutBolt className={className} />;
      break;
    default:
      body = <IconClock className={className} />;
      break;
  }
  return (
    <span role="img" aria-label={label} className="inline-flex shrink-0 text-align-forest">
      {body}
    </span>
  );
}
