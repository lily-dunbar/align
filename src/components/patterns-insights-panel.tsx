import { PatternInsightCard } from "@/components/pattern-insight-card";
import type { PatternsFeatureJson } from "@/lib/patterns/types";

export function PatternsInsightsPanel({ data }: { data: PatternsFeatureJson }) {
  const ordered = [...data.patterns].sort(
    (a, b) => b.confidencePercent - a.confidencePercent,
  );

  return (
    <div className="space-y-4">
      {ordered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
          No patterns met your confidence bar for this window. Try a longer range or more Dexcom
          data and workouts.
        </p>
      ) : (
        <ul className="space-y-4">
          {ordered.map((p) => (
            <li key={p.id}>
              <PatternInsightCard
                pattern={p}
                targetLowMgdl={data.featureContext.targetLowMgdl}
                targetHighMgdl={data.featureContext.targetHighMgdl}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
