import { PatternWindowSummaryCards } from "@/components/pattern-window-summary-cards";
import { getPatternWindowSummariesForIso } from "@/lib/patterns/window-summaries";
import type { PatternWindow } from "@/lib/patterns/types";

export async function PatternSummariesSection({
  userId,
  window,
  atIso,
}: {
  userId: string;
  window: PatternWindow;
  atIso: string;
}) {
  const data = await getPatternWindowSummariesForIso(userId, window, atIso);
  return <PatternWindowSummaryCards data={data} />;
}
