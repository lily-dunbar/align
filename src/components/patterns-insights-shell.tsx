"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";

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
  const [pendingWindow, setPendingWindow] = useState<PatternWindow | null>(null);

  useEffect(() => {
    if (pendingWindow === activeWindow) {
      setPendingWindow(null);
    }
  }, [activeWindow, pendingWindow]);

  function navigate(next: PatternWindow) {
    if (next === activeWindow) return;
    setPendingWindow(next);
    const href = `/patterns?window=${next}&timeZone=${encodeURIComponent(timeZone)}`;
    startTransition(() => {
      router.push(href);
    });
  }

  const showLoadingState = isPending || pendingWindow !== null;

  return (
    <div className="flex flex-col gap-8">
      <div className="space-y-3">
        <PatternRangeFilters
          active={activeWindow}
          timeZone={timeZone}
          onWindowChange={navigate}
          navigationPending={showLoadingState}
        />
        {showLoadingState ? <PatternInclusionLineSkeleton /> : inclusion}
      </div>

      {showLoadingState ? <PatternWindowSummaryCardsSkeleton /> : summaries}

      {showLoadingState ? <PatternsTakeawaysSectionSkeleton /> : takeaways}
    </div>
  );
}
