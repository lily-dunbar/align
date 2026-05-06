export type FoodTypeTag =
  | "low_impact"
  | "fast_acting"
  | "medium_acting"
  | "slow_acting";

const FOOD_TYPE_NOTE_PREFIX = "food_type:";

export function parseFoodTypeTag(notes: string | null | undefined): FoodTypeTag | null {
  if (!notes) return null;
  const raw = notes.trim().toLowerCase();
  if (!raw.startsWith(FOOD_TYPE_NOTE_PREFIX)) return null;
  const tag = raw.slice(FOOD_TYPE_NOTE_PREFIX.length);
  if (
    tag === "low_impact" ||
    tag === "fast_acting" ||
    tag === "medium_acting" ||
    tag === "slow_acting"
  ) {
    return tag;
  }
  return null;
}

export function toFoodTypeNote(tag: FoodTypeTag | null): string | null {
  if (!tag) return null;
  return `${FOOD_TYPE_NOTE_PREFIX}${tag}`;
}

export function foodTypeTagLabel(tag: FoodTypeTag): string {
  if (tag === "low_impact") return "Low impact";
  if (tag === "fast_acting") return "Fast acting";
  if (tag === "medium_acting") return "Medium acting";
  return "Slow acting";
}

export function foodTypeAbsorptionHours(tag: FoodTypeTag): number {
  if (tag === "low_impact") return 0.5;
  if (tag === "fast_acting") return 1;
  if (tag === "medium_acting") return 2;
  return 3;
}
