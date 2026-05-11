"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { revalidatePatternInsightsAction } from "@/app/patterns/actions";

export function PatternsRegenerateButton({ patternsDataUserId }: { patternsDataUserId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          await revalidatePatternInsightsAction(patternsDataUserId);
          router.refresh();
        })
      }
      disabled={pending}
      className="shrink-0 rounded-full border border-align-border/90 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-sm shadow-black/[0.04] transition hover:bg-align-subtle disabled:opacity-60"
    >
      {pending ? "Regenerating…" : "Regenerate insights"}
    </button>
  );
}
