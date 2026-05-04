import { PatternWindowInclusionSummary } from "@/components/pattern-window-inclusion-summary";
import { getPatternsFeatureJsonForIso } from "@/lib/patterns/feature-json";
import type { PatternWindow } from "@/lib/patterns/types";

export async function PatternsInclusionLine({
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
    <PatternWindowInclusionSummary
      inclusion={feature.featureContext.inclusion}
      timeZone={timeZone}
    />
  );
}
