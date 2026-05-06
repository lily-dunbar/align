"use client";

import { useEffect } from "react";

import { DAY_DATA_CHANGED_EVENT } from "@/lib/day-view-events";

const AUTO_SYNC_LAST_RUN_KEY = "align:home-steps-auto-sync:last-run-ms";
const AUTO_SYNC_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * On home load, opportunistically pull latest Shortcuts file data into DB.
 * No-op/fail-silent when file sync isn't configured.
 */
export function HomeStepsAutoSync() {
  useEffect(() => {
    let cancelled = false;

    async function run() {
      const now = Date.now();
      try {
        const raw = sessionStorage.getItem(AUTO_SYNC_LAST_RUN_KEY);
        const last = raw ? Number(raw) : 0;
        if (Number.isFinite(last) && now - last < AUTO_SYNC_COOLDOWN_MS) return;
      } catch {
        // private mode / disabled storage; continue best-effort.
      }

      try {
        const resp = await fetch("/api/import/health-sync", {
          method: "POST",
          cache: "no-store",
          credentials: "include",
        });
        const json = (await resp.json()) as {
          ok?: boolean;
          inserted?: number;
          updated?: number;
          unchanged?: number;
        };

        if (cancelled) return;

        try {
          sessionStorage.setItem(AUTO_SYNC_LAST_RUN_KEY, String(now));
        } catch {
          // ignore
        }

        // Only trigger refetch when there is a real data change.
        if (resp.ok && json.ok && ((json.inserted ?? 0) > 0 || (json.updated ?? 0) > 0)) {
          window.dispatchEvent(new CustomEvent(DAY_DATA_CHANGED_EVENT));
        }
      } catch {
        // Ignore transient/network/config errors; Home should remain fast.
      }
    }

    queueMicrotask(() => {
      void run();
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

