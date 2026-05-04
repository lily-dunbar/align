import { PatternsInsightsPanel } from "@/components/patterns-insights-panel";
import { PatternsRegenerateButton } from "@/components/patterns-regenerate-button";
import { getPatternsFeatureJsonForIso } from "@/lib/patterns/feature-json";
import type { PatternWindow } from "@/lib/patterns/types";

export async function PatternsTakeawaysSection({
  userId,
  window,
  timeZone,
  atIso,
}: {
  userId: string;
  window: PatternWindow;
  timeZone: string;
  atIso: string;
}) {
  const feature = await getPatternsFeatureJsonForIso(userId, window, timeZone, atIso);
  return (
    <div className="rounded-2xl border border-align-border/90 bg-white/90 p-6 ring-1 ring-black/[0.03]">
      <div className="mb-5 flex flex-col gap-4 border-b border-align-border-soft pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-align-muted">
            Takeaways
          </h2>
          <p className="mt-1.5 text-sm text-zinc-600">Generated for the range and timezone above.</p>
        </div>
        <PatternsRegenerateButton />
      </div>
      <PatternsInsightsPanel data={feature} />
    </div>
  );
}
