import { PatternsInsightsPanel } from "@/components/patterns-insights-panel";
import { PatternsRegenerateButton } from "@/components/patterns-regenerate-button";
import { getPatternsFeatureJsonForIso } from "@/lib/patterns/feature-json";
import type { PatternWindow } from "@/lib/patterns/types";
import { uiPanelSurface } from "@/lib/ui-surfaces";

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
    <div className={`p-6 ${uiPanelSurface}`}>
      <div className="mb-5 flex flex-col gap-4 border-b border-align-border-soft pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-align-muted">
            Insights
          </h2>
        </div>
        <PatternsRegenerateButton patternsDataUserId={userId} />
      </div>
      <PatternsInsightsPanel data={feature} />
    </div>
  );
}
