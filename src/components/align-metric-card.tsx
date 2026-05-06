import type { ReactNode } from "react";

type MetricVariant = "glucose" | "tir" | "steps" | "carbs";

const shells: Record<MetricVariant, string> = {
  glucose:
    "border-white/60 bg-align-card-glucose ring-1 ring-black/[0.04] dark:border-white/5 dark:ring-white/10",
  tir: "border-white/60 bg-align-card-tir ring-1 ring-black/[0.04] dark:border-white/5 dark:ring-white/10",
  steps:
    "border-white/60 bg-align-card-steps ring-1 ring-black/[0.04] dark:border-white/5 dark:ring-white/10",
  carbs:
    "border-white/60 bg-amber-50/90 ring-1 ring-amber-200/60 dark:border-white/5 dark:ring-white/10",
};

const valueColors: Record<MetricVariant, string> = {
  glucose: "text-align-text-glucose",
  tir: "text-align-text-tir",
  steps: "text-align-text-steps",
  carbs: "text-amber-900",
};

function MetricIcon({ variant }: { variant: MetricVariant }) {
  const cls = "h-4 w-4 shrink-0 text-zinc-500/90";
  if (variant === "glucose") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3c-3 4-4.5 7.5-4.5 11a4.5 4.5 0 109 0C16.5 10.5 15 7 12 3z"
          stroke="currentColor"
          strokeWidth={1.25}
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (variant === "tir") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx={12} cy={12} r={9} stroke="currentColor" strokeWidth={1.25} />
        <circle cx={12} cy={12} r={3} fill="currentColor" />
      </svg>
    );
  }
  if (variant === "carbs") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M6 18V12M10 18V8M14 18v-5M18 18v-9"
          stroke="currentColor"
          strokeWidth={1.35}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 12h2l2-6 4 12 3-9h5"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Props = {
  variant: MetricVariant;
  title: string;
  value: string;
  /** Shown smaller beside the value (e.g. `mg/dL` on glucose cards). */
  valueUnit?: string;
  subtitle?: ReactNode;
};

export function AlignMetricCard({ variant, title, value, valueUnit, subtitle }: Props) {
  return (
    <div className={`rounded-2xl border px-4 pb-4 pt-3.5 text-left ${shells[variant]}`}>
      <div className="flex items-start gap-2">
        <MetricIcon variant={variant} />
        <p className="min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          {title}
        </p>
      </div>
      <p
        className={`mt-3 flex flex-wrap items-baseline gap-x-1.5 leading-none ${valueColors[variant]}`}
      >
        <span className="text-[1.75rem] font-semibold tabular-nums tracking-tight">{value}</span>
        {valueUnit ? (
          <span className="text-xs font-medium tabular-nums tracking-tight opacity-90">
            {valueUnit}
          </span>
        ) : null}
      </p>
      {subtitle ? (
        <p className="mt-2 text-xs leading-relaxed text-align-muted">{subtitle}</p>
      ) : null}
    </div>
  );
}
