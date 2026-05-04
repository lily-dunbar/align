import "server-only";

import type { DayInsightSnapshot } from "@/lib/day-insight-context";
import type { DayInsightItem } from "@/lib/day-insights-llm";

function parseYmdParts(dateYmd: string): { month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd.trim());
  if (!m) return null;
  return { month: Number(m[2]), day: Number(m[3]) };
}

type DayHook = { title: string; lead: string };

function calendarHook(month: number, day: number): DayHook | null {
  if (month === 5 && day === 4) {
    return {
      title: "May the 4th be with your CGM",
      lead: "May the 4th of good BGs be in your favor.",
    };
  }
  if (month === 3 && day === 14) {
    return {
      title: "Pi Day patience",
      lead: "Happy Pi Day — hoping your curve is as satisfying as a well-baked slice.",
    };
  }
  if (month === 2 && day === 14) {
    return {
      title: "Heart on your sleeve",
      lead: "Happy Valentine’s — extra warmth for every hour that behaved on the graph.",
    };
  }
  if (month === 4 && day === 1) {
    return {
      title: "No April Fool’s on the log",
      lead: "April 1 is for jokes; actually tracking your day is the opposite.",
    };
  }
  if (month === 10 && day === 31) {
    return {
      title: "Treats, not tricks",
      lead: "Happy Halloween — may your readings skew more treat than trick.",
    };
  }
  if (month === 1 && day === 1) {
    return {
      title: "New year, same honest chart",
      lead: "Fresh calendar energy — here’s to kind trends and data you can trust.",
    };
  }
  if (month === 12 && day === 25) {
    return {
      title: "Holiday calm",
      lead: "Season’s greetings — hope you found a little flat line between the festivities.",
    };
  }
  if (month === 7 && day === 4) {
    return {
      title: "Sparkler-grade steady",
      lead: "Happy Fourth — may your range behave like a good backyard fireworks finale (controlled burn).",
    };
  }
  return null;
}

const GENERIC_HOOKS: DayHook[] = [
  {
    title: "Your daily nod from Align",
    lead: "Another notch on the calendar — thanks for meeting your day with real data.",
  },
  {
    title: "Plot twist: you kept logging",
    lead: "Smooth or scribbly, the line still tells your story — no shame in either.",
  },
  {
    title: "Main character energy",
    lead: "Today’s chart stars you — even off days are plot development.",
  },
  {
    title: "Small observations, big picture",
    lead: "One day doesn’t define you, but every dot helps the next decision feel lighter.",
  },
  {
    title: "Showing up counts",
    lead: "Opening Align is already momentum — the rest is fine-tuning.",
  },
];

function genericHook(month: number, day: number): DayHook {
  const idx = Math.abs((month * 31 + day) % GENERIC_HOOKS.length);
  return GENERIC_HOOKS[idx]!;
}

function dataTail(
  a: DayInsightSnapshot["aggregates"],
  t: DayInsightSnapshot["targets"],
): string {
  const chunks: string[] = [];
  if (a.glucoseReadingsCount > 0) {
    const tir = Math.round(a.tirInRangePercent);
    if (tir >= t.tirGoalPercent) {
      chunks.push(
        `About ${tir}% of CGM time today was in your ${t.lowMgdl}–${t.highMgdl} mg/dL band — right where you’re aiming.`,
      );
    } else if (tir >= 70) {
      chunks.push(
        `Roughly ${tir}% in range today (${t.lowMgdl}–${t.highMgdl} mg/dL) — plenty of signal to work with.`,
      );
    } else {
      chunks.push(
        `About ${tir}% in range today — bumpy days are still data, not defeat.`,
      );
    }
  } else {
    chunks.push(
      "No CGM readings for this day yet — the graph is patiently waiting for you.",
    );
  }

  if (a.totalSteps > 0) {
    const hitGoal = a.totalSteps >= t.stepsGoalPerDay;
    chunks.push(
      hitGoal
        ? `Steps hit ${a.totalSteps.toLocaleString()} (past your daily goal).`
        : `Steps sit at ${a.totalSteps.toLocaleString()} today.`,
    );
  }

  const moveCount = a.manualWorkoutsCount + a.stravaActivitiesCount;
  if (moveCount > 0) {
    chunks.push(
      moveCount === 1
        ? "You logged a workout — context makes the curve easier to read."
        : `${moveCount} workouts logged — movement adds helpful context.`,
    );
  }

  return chunks.join(" ");
}

/**
 * Always-on cheeky “daily spark”: calendar hooks when we have them, plus a data-grounded tail.
 */
export function buildDailySparkInsight(snapshot: DayInsightSnapshot): DayInsightItem {
  const ymd = snapshot.dateYmd;
  const parts = ymd ? parseYmdParts(ymd) : null;
  const hook = parts
    ? (calendarHook(parts.month, parts.day) ?? genericHook(parts.month, parts.day))
    : GENERIC_HOOKS[0]!;
  const tail = dataTail(snapshot.aggregates, snapshot.targets);
  return {
    title: hook.title.slice(0, 120),
    detail: `${tail} ${hook.lead}`.replace(/\s+/g, " ").trim().slice(0, 650),
  };
}
