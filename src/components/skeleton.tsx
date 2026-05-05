import type { ComponentPropsWithoutRef } from "react";

type SkeletonProps = ComponentPropsWithoutRef<"div"> & {
  /** Announced to screen readers while loading */
  label?: string;
};

/** Shimmer block — combine with width/height classes. */
export function Skeleton({ className = "", label, ...props }: SkeletonProps) {
  return (
    <div
      role={label ? "status" : undefined}
      aria-label={label}
      aria-busy={label ? true : undefined}
      className={`animate-pulse rounded-md bg-zinc-200/70 dark:bg-zinc-600/40 ${className}`}
      {...props}
    />
  );
}

export function DateNavSkeleton() {
  return (
    <section className="w-full py-0.5" aria-hidden>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-10 w-20 rounded-full" />
          <Skeleton className="h-10 w-36 rounded-xl" />
          <Skeleton className="h-10 w-20 rounded-full" />
        </div>
        <Skeleton className="h-11 w-36 rounded-full" />
      </div>
    </section>
  );
}

export function DailyViewChartSkeleton() {
  return (
    <section
      className="w-full min-w-0 rounded-2xl border border-align-border/90 bg-white/90 p-5 ring-1 ring-black/[0.03] md:p-6"
      aria-hidden
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-6 w-28" />
        <div className="flex flex-wrap items-center gap-1.5">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-8 w-12 rounded-full" />
          <Skeleton className="h-8 w-12 rounded-full" />
        </div>
      </div>
      <Skeleton className="mt-2 h-4 max-w-md" />
      <div className="mt-4 h-[22rem] min-h-[20rem] w-full animate-pulse rounded-xl bg-gradient-to-b from-align-subtle via-zinc-200/40 to-align-subtle ring-1 ring-inset ring-black/[0.04] sm:h-96" />
    </section>
  );
}

export function DaySummaryCardsSkeleton() {
  return (
    <section className="w-full" aria-label="Loading day summary" role="status" aria-busy="true">
      <Skeleton className="mb-4 h-3 w-24" />
      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <MetricCardShape />
        <MetricCardShape />
        <MetricCardShape />
      </div>
    </section>
  );
}

function MetricCardShape() {
  return (
    <div className="rounded-2xl border border-white/60 bg-align-subtle/90 p-4 ring-1 ring-black/[0.04]">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 shrink-0 rounded" />
        <Skeleton className="h-3 flex-1" />
      </div>
      <Skeleton className="mt-4 h-8 w-[65%]" />
      <Skeleton className="mt-3 h-3 w-full" />
    </div>
  );
}

export function PatternInclusionLineSkeleton() {
  return (
    <Skeleton
      className="h-3 max-w-lg"
      label="Loading date range and coverage summary"
    />
  );
}

export function PatternWindowSummaryCardsSkeleton() {
  return (
    <section
      className="w-full"
      aria-label="Loading window metrics"
      role="status"
      aria-busy="true"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCardShape />
        <MetricCardShape />
        <MetricCardShape />
      </div>
    </section>
  );
}

function PatternTakeawayInsightCardSkeleton() {
  return (
    <li className="rounded-2xl border border-align-border/80 bg-white p-6 shadow-sm shadow-black/[0.03] ring-1 ring-black/[0.02]">
      <Skeleton className="h-5 max-w-md" />
      <Skeleton className="mt-4 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-[95%]" />
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <Skeleton className="h-7 w-32 rounded-full" />
        <Skeleton className="h-5 w-20" />
      </div>
    </li>
  );
}

export function PatternsTakeawaysSectionSkeleton() {
  return (
    <div
      className="rounded-2xl border border-align-border/90 bg-white/90 p-6 ring-1 ring-black/[0.03]"
      role="status"
      aria-busy="true"
      aria-label="Loading insight cards"
    >
      <div className="mb-5 flex flex-col gap-4 border-b border-align-border-soft pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-9 w-28 shrink-0 rounded-full" />
      </div>
      <ul className="space-y-4">
        <PatternTakeawayInsightCardSkeleton />
        <PatternTakeawayInsightCardSkeleton />
        <PatternTakeawayInsightCardSkeleton />
      </ul>
    </div>
  );
}

function InsightRowSkeleton() {
  return (
    <li className="rounded-xl border border-align-border/80 bg-align-subtle/50 px-4 py-3 ring-1 ring-black/[0.02]">
      <Skeleton className="h-4 max-w-xs" />
      <Skeleton className="mt-2 h-3 w-full" />
      <Skeleton className="mt-2 h-3 max-w-md" />
    </li>
  );
}

export function DayInsightsListSkeleton() {
  return (
    <ul className="mt-4 space-y-3" aria-hidden>
      <InsightRowSkeleton />
      <InsightRowSkeleton />
      <InsightRowSkeleton />
    </ul>
  );
}

export function DayInsightsPanelSkeleton() {
  return (
    <section
      className="w-full rounded-2xl border border-align-border/90 bg-white/90 p-5 ring-1 ring-black/[0.03] md:p-6"
      aria-label="Loading day insights"
      role="status"
      aria-busy="true"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>
      <Skeleton className="mt-2 h-3 max-w-lg" />
      <DayInsightsListSkeleton />
    </section>
  );
}

/** Date → chart → summary → insights (manual entry omitted — usually `showCard={false}`). */
export function DailyDashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <DateNavSkeleton />
      <DailyViewChartSkeleton />
      <DaySummaryCardsSkeleton />
      <DayInsightsPanelSkeleton />
    </div>
  );
}

/** Range filters → inclusion line → metric cards → insights (matches `/patterns` layout). */
export function PatternsPageSkeleton() {
  return (
    <div
      className="flex flex-col gap-8"
      role="status"
      aria-busy="true"
      aria-label="Loading insights"
    >
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Insights</h1>
        <p className="max-w-xl text-sm text-align-muted">Loading…</p>
      </header>

      <div className="space-y-3" aria-hidden>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-10 w-24 rounded-full" />
          <Skeleton className="h-10 w-28 rounded-full" />
          <Skeleton className="h-10 w-24 rounded-full" />
        </div>
        <Skeleton className="h-3 max-w-lg" aria-hidden />
      </div>

      <PatternWindowSummaryCardsSkeleton />

      <PatternsTakeawaysSectionSkeleton />
    </div>
  );
}
