import { minDexcomDaysForWindow } from "@/lib/patterns/coverage-gates";
import type { PatternWindowInclusion } from "@/lib/patterns/types";

function formatYmdHuman(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Last segment of IANA zone, e.g. America/Los_Angeles → Los Angeles */
function timeZoneShortLabel(iana: string): string {
  const leaf = iana.split("/").pop() ?? iana;
  return leaf.replace(/_/g, " ");
}

const GRADIENT_NOTICE_CARD =
  "w-full rounded-2xl border border-white/70 bg-[linear-gradient(135deg,rgba(221,234,229,0.78)_0%,rgba(212,227,246,0.8)_52%,rgba(243,245,235,0.78)_100%)] px-4 py-3 shadow-[0_8px_18px_-16px_rgba(35,84,92,0.3)] ring-1 ring-black/[0.025]";

type Props = {
  inclusion: PatternWindowInclusion;
  timeZone: string;
  /** Rolling window length (7 / 30 / 90) for coverage expectations. */
  labelDays: number;
};

export function PatternWindowInclusionSummary({ inclusion, timeZone, labelDays }: Props) {
  const a = formatYmdHuman(inclusion.rangeStartYmd);
  const b = formatYmdHuman(inclusion.rangeEndYmd);
  const rangeLabel = a === b ? a : `${a} – ${b}`;
  const tzShort = timeZoneShortLabel(timeZone);

  const line = [
    rangeLabel,
    tzShort,
    `${inclusion.daysWithCgm.toLocaleString()} Dexcom`,
    `${inclusion.daysWithSteps.toLocaleString()} steps`,
    `${inclusion.activitiesCount.toLocaleString()} activities`,
  ].join("\u00B7");

  const minDays = minDexcomDaysForWindow(labelDays);
  const thinCgm =
    inclusion.daysWithCgm === 0
      ? "no"
      : inclusion.daysWithCgm < minDays
        ? "thin"
        : null;

  return (
    <div className="space-y-2">
      {thinCgm === "no" ? (
        <div className={GRADIENT_NOTICE_CARD} role="status" aria-live="polite">
          <p className="text-sm leading-relaxed text-zinc-700">
            No Dexcom data in this range yet. Connect Dexcom in Settings, sync, then try again—or pick a
            shorter window if you only have a few recent days of readings.
          </p>
        </div>
      ) : thinCgm === "thin" ? (
        <p
          className={`${GRADIENT_NOTICE_CARD} text-sm leading-relaxed text-zinc-700`}
          role="status"
        >
          Not enough Dexcom coverage for a strong {labelDays}-day view—only{" "}
          {inclusion.daysWithCgm.toLocaleString()} local day
          {inclusion.daysWithCgm === 1 ? "" : "s"} with readings (we suggest at least {minDays} for this
          range). Insights may look like a shorter window; sync Dexcom or try 7 days.
        </p>
      ) : null}
      <p
        className="text-xs leading-relaxed text-align-muted"
        title={`Full range and time zone: ${inclusion.rangeStartYmd} → ${inclusion.rangeEndYmd}, ${timeZone}`}
      >
        <span className="sr-only">Data coverage for this window: </span>
        {line}
      </p>
    </div>
  );
}
