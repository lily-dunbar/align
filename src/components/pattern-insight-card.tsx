import { PatternInsightTypeIcon } from "@/components/pattern-insight-type-icon";
import { PatternLearnMorePanel } from "@/components/pattern-learn-more-panel";
import { confidenceTier, humanConfidenceLabel } from "@/lib/patterns/confidence-label";
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

const SOURCE_TAG_CLASS =
  "inline-flex max-w-full min-w-0 items-center rounded-full border border-align-border/55 bg-align-subtle/60 px-2.5 py-1 text-[11px] font-semibold leading-tight text-align-forest sm:text-xs";

export function PatternInsightCard({ pattern, compact, targetLowMgdl, targetHighMgdl }: Props) {
  const pad = compact ? "p-5" : "p-5 sm:p-6";
  const pct = pattern.confidencePercent;
  const confidenceHint = `${pct}% — ${humanConfidenceLabel(pct)}`;
  const tier = confidenceTier(pct);
  const confidenceTagClass =
    tier === "low"
      ? "inline-flex max-w-full min-w-0 shrink-0 items-center gap-1.5 rounded-full border border-amber-200/90 bg-amber-100 px-2.5 py-1 text-[11px] font-semibold leading-tight text-amber-950 sm:text-xs"
      : "inline-flex max-w-full min-w-0 shrink-0 items-center gap-1.5 rounded-full border border-align-border/45 bg-align-nav-active px-2.5 py-1 text-[11px] font-semibold leading-tight text-align-forest sm:text-xs";

  const sources = pattern.linkedSources ?? [];

  return (
    <article
      className={`rounded-2xl border border-align-border/80 bg-white shadow-sm shadow-black/[0.03] ${pad}`}
    >
      <div className="flex gap-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-align-nav-active ring-1 ring-align-forest/15">
          <PatternInsightTypeIcon pattern={pattern} className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-2.5">
          <h3 className="text-base font-semibold leading-snug tracking-tight text-align-forest sm:text-[1.05rem]">
            {pattern.title}
          </h3>
          <p className="text-sm leading-relaxed text-align-forest/90 sm:text-[15px]">{pattern.description}</p>

          <div className="flex flex-wrap items-center gap-2">
            {sources.map((raw) => (
              <span key={raw} className={SOURCE_TAG_CLASS} title={toTitleCaseSourceLabel(raw)}>
                <span className="min-w-0 max-w-full truncate">{toTitleCaseSourceLabel(raw)}</span>
              </span>
            ))}
            <span className={confidenceTagClass} title={confidenceHint}>
              <span className="tabular-nums">{pct}%</span>
              <span className="font-medium text-current/85">confidence</span>
            </span>
          </div>
        </div>
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
