"use client";

import { useState } from "react";

export function SyncDexcomButton() {
  const [isSyncing, setIsSyncing] = useState(false);

  return (
    <form
      action="/api/integrations/dexcom/sync"
      method="post"
      onSubmit={() => setIsSyncing(true)}
    >
      <button
        className="rounded border px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        type="submit"
        disabled={isSyncing}
      >
        {isSyncing ? "Syncing Dexcom..." : "Sync Dexcom (first sync = 90d)"}
      </button>
    </form>
  );
}
