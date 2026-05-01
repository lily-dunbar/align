import { PatternInsightCard } from "@/components/pattern-insight-card";
import type { PatternsFeatureJson } from "@/lib/patterns/types";

export function PatternsInsightsPanel({ data }: { data: PatternsFeatureJson }) {
  const ordered = [...data.patterns].sort(
    (a, b) => b.confidencePercent - a.confidencePercent,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
        <span>
          Range ends now · last {data.range.labelDays} days · TZ {data.timeZone} ·
          min. confidence {data.patternThresholdPercent}%
        </span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700">
          {data.source === "anthropic" ? "Claude" : "Built-in summaries"}
        </span>
      </div>

      {ordered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
          No patterns at or above your {data.patternThresholdPercent}% threshold. Change
          the pattern threshold in Settings, or add more data for this range.
        </p>
      ) : (
        <ul className="space-y-3">
          {ordered.map((p) => (
            <li key={p.id}>
              <PatternInsightCard pattern={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
