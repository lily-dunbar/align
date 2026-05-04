"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function PatternsRegenerateButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className="shrink-0 rounded-full border border-align-border/90 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-sm shadow-black/[0.04] transition hover:bg-align-subtle disabled:opacity-60"
    >
      {pending ? "Regenerating…" : "Regenerate insights"}
    </button>
  );
}
