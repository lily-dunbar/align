"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";

import { PatternRangeFilters } from "@/components/pattern-range-filters";
import {
  PatternInclusionLineSkeleton,
  PatternWindowSummaryCardsSkeleton,
  PatternsTakeawaysSectionSkeleton,
} from "@/components/skeleton";
import type { PatternWindow } from "@/lib/patterns/types";

type Props = {
  activeWindow: PatternWindow;
  timeZone: string;
  inclusion: ReactNode;
  summaries: ReactNode;
  takeaways: ReactNode;
};

export function PatternsInsightsShell({
  activeWindow,
  timeZone,
  inclusion,
  summaries,
  takeaways,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(next: PatternWindow) {
    if (next === activeWindow) return;
    const href = `/patterns?window=${next}&timeZone=${encodeURIComponent(timeZone)}`;
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="space-y-3">
        <PatternRangeFilters
          active={activeWindow}
          timeZone={timeZone}
          onWindowChange={navigate}
          navigationPending={isPending}
        />
        {isPending ? <PatternInclusionLineSkeleton /> : inclusion}
      </div>

      {isPending ? <PatternWindowSummaryCardsSkeleton /> : summaries}

      {isPending ? <PatternsTakeawaysSectionSkeleton /> : takeaways}
    </div>
  );
}
