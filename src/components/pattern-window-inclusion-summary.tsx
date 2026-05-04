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

type Props = {
  inclusion: PatternWindowInclusion;
  timeZone: string;
};

export function PatternWindowInclusionSummary({ inclusion, timeZone }: Props) {
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

  return (
    <p
      className="text-xs leading-relaxed text-align-muted"
      title={`Full range and time zone: ${inclusion.rangeStartYmd} → ${inclusion.rangeEndYmd}, ${timeZone}`}
    >
      <span className="sr-only">Data coverage for this window: </span>
      {line}
    </p>
  );
}
