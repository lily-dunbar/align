import type { ComponentPropsWithoutRef } from "react";

import { uiHeroSurface, uiPanelSurface } from "@/lib/ui-surfaces";

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
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 sm:gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-10 w-32 justify-self-center rounded-full sm:w-36" />
          <Skeleton className="h-10 w-10 justify-self-end rounded-full" />
        </div>
        <div className="flex justify-stretch sm:justify-end">
          <Skeleton className="h-11 w-full rounded-full sm:w-40" />
        </div>
      </div>
    </section>
  );
}

export function DailyViewChartSkeleton() {
  return (
    <section className={`w-full min-w-0 p-5 md:p-6 ${uiHeroSurface}`} aria-hidden>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-6 w-28" />
        <div className="flex flex-wrap items-center gap-1.5">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-8 w-12 rounded-full" />
          <Skeleton className="h-8 w-12 rounded-full" />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 pb-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="mt-4 h-[22rem] min-h-[20rem] w-full animate-pulse rounded-xl border border-align-border/50 bg-gradient-to-b from-align-subtle via-zinc-200/40 to-align-subtle sm:h-96" />
    </section>
  );
}

export function DaySummaryCardsSkeleton() {
  return (
    <section className="w-full" aria-label="Loading day summary" role="status" aria-busy="true">
      <Skeleton className="mb-4 h-3 w-24" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
        <MetricCardShape />
        <MetricCardShape />
        <MetricCardShape />
      </div>
    </section>
  );
}

function MetricCardShape() {
  return (
    <div className="rounded-2xl border border-align-border/55 bg-white p-4 shadow-sm shadow-black/[0.03]">
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
    <li className="rounded-2xl border border-align-border/80 bg-white p-5 shadow-sm shadow-black/[0.03] sm:p-6">
      <div className="flex gap-3.5">
        <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2.5">
          <Skeleton className="h-5 max-w-[min(100%,18rem)]" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[94%]" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-7 w-20 rounded-full" />
            <Skeleton className="h-7 w-24 rounded-full" />
            <Skeleton className="h-7 w-[5.5rem] rounded-full" />
          </div>
        </div>
      </div>
      <div className="mt-4 border-t border-align-border-soft pt-3">
        <Skeleton className="h-4 w-24" />
      </div>
    </li>
  );
}

export function PatternsTakeawaysSectionSkeleton() {
  return (
    <div
      className={`p-6 ${uiPanelSurface}`}
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
    <li className="rounded-xl border border-align-border/70 bg-align-subtle/50 px-4 py-3 shadow-sm shadow-black/[0.02]">
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
      className={`w-full p-5 md:p-6 ${uiPanelSurface}`}
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
      <div className="w-full space-y-3" aria-hidden>
        <div className="flex w-full min-w-0 gap-1 rounded-full bg-zinc-100/90 p-1 ring-1 ring-zinc-200/55">
          <Skeleton className="h-10 min-h-10 flex-1 basis-0 rounded-full" />
          <Skeleton className="h-10 min-h-10 flex-1 basis-0 rounded-full" />
          <Skeleton className="h-10 min-h-10 flex-1 basis-0 rounded-full" />
        </div>
        <Skeleton className="h-3 max-w-lg" aria-hidden />
      </div>

      <PatternWindowSummaryCardsSkeleton />

      <PatternsTakeawaysSectionSkeleton />
    </div>
  );
}
