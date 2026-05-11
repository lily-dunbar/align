import { minDexcomDaysForWindow } from "@/lib/patterns/coverage-gates";
import { uiSoftCallout } from "@/lib/ui-surfaces";
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

const INCLUSION_NOTICE_CARD = `w-full px-4 py-3 ${uiSoftCallout}`;

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

  const cgmDays = inclusion.daysWithCgm.toLocaleString();
  const stepDays = inclusion.daysWithSteps.toLocaleString();
  const activityTotal = inclusion.activitiesCount.toLocaleString();

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
        <div className={INCLUSION_NOTICE_CARD} role="status" aria-live="polite">
          <p className="text-sm leading-relaxed text-zinc-700">
            No Dexcom data in this range yet. Connect Dexcom in Settings, sync, then try again—or pick a
            shorter window if you only have a few recent days of readings.
          </p>
        </div>
      ) : thinCgm === "thin" ? (
        <p
          className={`${INCLUSION_NOTICE_CARD} text-sm leading-relaxed text-zinc-700`}
          role="status"
        >
          Not enough Dexcom coverage for a strong {labelDays}-day view—only{" "}
          {inclusion.daysWithCgm.toLocaleString()} local day
          {inclusion.daysWithCgm === 1 ? "" : "s"} with readings (we suggest at least {minDays} for this
          range). Insights may look like a shorter window; sync Dexcom or try 7 days.
        </p>
      ) : null}
      <div
        className="text-xs leading-relaxed text-align-muted"
        title={`Full range and time zone: ${inclusion.rangeStartYmd} → ${inclusion.rangeEndYmd}, ${timeZone}`}
      >
        <p className="sr-only">
          Data coverage for this window: {rangeLabel}, {tzShort} time. CGM on {cgmDays} local day
          {inclusion.daysWithCgm === 1 ? "" : "s"}, steps on {stepDays} local day
          {inclusion.daysWithSteps === 1 ? "" : "s"}, {activityTotal} logged workouts and activities.
        </p>
        <p className="text-zinc-700">
          <span className="font-medium text-zinc-800">{rangeLabel}</span>
          <span className="text-zinc-400" aria-hidden>
            {" "}
            ·{" "}
          </span>
          <span>{tzShort}</span>
          <span className="text-zinc-500"> time</span>
        </p>
        <p className="mt-1 text-zinc-600">
          <span>
            CGM on <span className="tabular-nums text-zinc-800">{cgmDays}</span> local day
            {inclusion.daysWithCgm === 1 ? "" : "s"}
          </span>
          <span className="text-zinc-400" aria-hidden>
            {" "}
            ·{" "}
          </span>
          <span>
            Steps on <span className="tabular-nums text-zinc-800">{stepDays}</span> local day
            {inclusion.daysWithSteps === 1 ? "" : "s"}
          </span>
          <span className="text-zinc-400" aria-hidden>
            {" "}
            ·{" "}
          </span>
          <span>
            <span className="tabular-nums text-zinc-800">{activityTotal}</span> logged workouts and
            activities
          </span>
        </p>
      </div>
    </div>
  );
}
