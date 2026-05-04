import { PatternLearnMorePanel } from "@/components/pattern-learn-more-panel";
import { confidenceBadgeLabel, humanConfidenceLabel } from "@/lib/patterns/confidence-label";
import type { PatternInsightJson } from "@/lib/patterns/types";

type Props = {
  pattern: PatternInsightJson;
  compact?: boolean;
  targetLowMgdl: number;
  targetHighMgdl: number;
};

function toTitleCaseSourceLabel(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatSources(sources: string[]): string {
  return sources.map((s) => toTitleCaseSourceLabel(s)).join(" · ");
}

export function PatternInsightCard({ pattern, compact, targetLowMgdl, targetHighMgdl }: Props) {
  const pad = compact ? "p-5" : "p-6";
  const sourcesLine = formatSources(pattern.linkedSources);
  const confidenceHint = humanConfidenceLabel(pattern.confidencePercent);

  return (
    <article
      className={`rounded-2xl border border-align-border/80 bg-white shadow-sm shadow-black/[0.03] ring-1 ring-black/[0.02] ${pad}`}
    >
      <h3
        className={`font-semibold tracking-tight text-foreground ${compact ? "text-base leading-snug" : "text-lg leading-snug"}`}
      >
        {pattern.title}
      </h3>

      <p
        className={`leading-relaxed text-align-muted ${compact ? "mt-3 text-sm" : "mt-4 text-[15px]"}`}
      >
        {pattern.description}
      </p>

      <div className={`flex flex-wrap items-center gap-2.5 ${compact ? "mt-3" : "mt-4"}`}>
        <span
          className="inline-flex rounded-full bg-align-nav-active px-2.5 py-1 text-xs font-medium text-align-forest"
          title={confidenceHint}
        >
          {confidenceBadgeLabel(pattern.confidencePercent)}
        </span>
        {sourcesLine ? (
          <span className="text-sm font-semibold text-align-forest">{sourcesLine}</span>
        ) : null}
      </div>

      {pattern.learnMore ? (
        <PatternLearnMorePanel
          learnMore={pattern.learnMore}
          targetLowMgdl={targetLowMgdl}
          targetHighMgdl={targetHighMgdl}
        />
      ) : null}
    </article>
  );
}
