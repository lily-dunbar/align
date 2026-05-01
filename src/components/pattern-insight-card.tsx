import type { PatternInsightJson } from "@/lib/patterns/types";

type Props = {
  pattern: PatternInsightJson;
  compact?: boolean;
};

function typeBadgeClasses(type: PatternInsightJson["type"]) {
  switch (type) {
    case "Temporal":
      return "bg-violet-100 text-violet-900";
    case "Steps":
      return "bg-sky-100 text-sky-900";
    case "Sessions":
      return "bg-amber-100 text-amber-950";
    default:
      return "bg-zinc-100 text-zinc-800";
  }
}

export function PatternInsightCard({ pattern, compact }: Props) {
  const pad = compact ? "p-4" : "p-5";

  return (
    <article
      className={`rounded-xl border border-zinc-200 bg-white shadow-sm ${pad}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${typeBadgeClasses(pattern.type)}`}
        >
          {pattern.type}
        </span>
        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-medium text-zinc-700">
          {pattern.confidencePercent}% confidence
        </span>
      </div>

      <h3
        className={`font-semibold tracking-tight text-zinc-900 ${compact ? "mt-2 text-base" : "mt-3 text-lg"}`}
      >
        {pattern.title}
      </h3>

      <p
        className={`leading-relaxed text-zinc-600 ${compact ? "mt-1.5 text-sm" : "mt-2 text-sm"}`}
      >
        {pattern.description}
      </p>

      <p className="mt-3 text-xs text-zinc-500">
        <span className="font-medium text-zinc-600">Linked sources:</span>{" "}
        {pattern.linkedSources.join(" · ")}
      </p>
    </article>
  );
}
