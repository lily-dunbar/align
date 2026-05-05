"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const SETTINGS_RETURN = encodeURIComponent("/settings");

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

export type IntegrationSnapshot = {
  dexcom: {
    connected: boolean;
    lastSyncAt: string | null;
    readingCount: number;
    shareCredentialsMode?: boolean;
    shareUiDismissed?: boolean;
  };
  strava: {
    connected: boolean;
    lastSyncAt: string | null;
    activityCount: number;
  };
  steps: {
    connected: boolean;
    lastIngestAt: string | null;
    stepsTotalStored: number;
  };
};

type StepsIngestInfo = {
  ingestUrl: string;
  notes: string[];
};

export function SettingsIntegrations({ initial }: { initial: IntegrationSnapshot }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stepsIngest, setStepsIngest] = useState<StepsIngestInfo | null>(null);
  const [copyFlash, setCopyFlash] = useState(false);

  const loadStepsIngestInfo = useCallback(async () => {
    if (!initial.steps.connected) {
      setStepsIngest(null);
      return;
    }
    try {
      const resp = await fetch("/api/ingest/steps/token", {
        method: "GET",
        credentials: "include",
      });
      const json = (await resp.json()) as StepsIngestInfo & { error?: string };
      if (!resp.ok) throw new Error(json.error ?? "Could not load ingest URL");
      setStepsIngest({ ingestUrl: json.ingestUrl, notes: json.notes ?? [] });
    } catch {
      setStepsIngest(null);
    }
  }, [initial.steps.connected]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadStepsIngestInfo();
    });
  }, [loadStepsIngestInfo]);

  async function disconnect(kind: "dexcom" | "strava" | "steps") {
    if (kind === "dexcom" && initial.dexcom.shareCredentialsMode) {
      if (
        !window.confirm(
          "Disconnect Dexcom Share for this account? Sync will stop until you choose Show Dexcom Share again. Server PYDEXCOM_* variables are unchanged—remove them to disable Share for everyone.",
        )
      ) {
        return;
      }
      setBusy("disconnect-dexcom");
      setNotice(null);
      try {
        const hide = await fetch("/api/integrations/dexcom/share-ui", { method: "POST" });
        if (!hide.ok) {
          const j = (await hide.json()) as { error?: string };
          throw new Error(j.error ?? "Could not update Dexcom Share preference");
        }
        const resp = await fetch("/api/integrations/dexcom/disconnect", { method: "DELETE" });
        const json = (await resp.json()) as { error?: string };
        if (!resp.ok) throw new Error(json.error ?? "Disconnect failed");
        setNotice("Dexcom Share disconnected for this account.");
        router.refresh();
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "Disconnect failed");
      } finally {
        setBusy(null);
      }
      return;
    }
    if (!window.confirm(`Disconnect ${kind === "steps" ? "Apple Steps ingest" : kind}?`)) {
      return;
    }
    setBusy(`disconnect-${kind}`);
    setNotice(null);
    try {
      const path =
        kind === "steps"
          ? "/api/integrations/steps/disconnect"
          : `/api/integrations/${kind}/disconnect`;
      const resp = await fetch(path, { method: "DELETE" });
      const json = (await resp.json()) as { error?: string };
      if (!resp.ok) throw new Error(json.error ?? "Disconnect failed");
      setNotice(`${kind === "steps" ? "Steps ingest" : kind} disconnected.`);
      router.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setBusy(null);
    }
  }

  async function showDexcomShareAgain() {
    setBusy("show-dexcom-share");
    setNotice(null);
    try {
      const resp = await fetch("/api/integrations/dexcom/share-ui", { method: "DELETE" });
      const json = (await resp.json()) as { error?: string };
      if (!resp.ok) throw new Error(json.error ?? "Could not restore Dexcom Share");
      setNotice("Dexcom Share is active again for this account.");
      router.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not restore Dexcom Share");
    } finally {
      setBusy(null);
    }
  }

  async function connectSteps() {
    setBusy("connect-steps");
    setNotice(null);
    try {
      const resp = await fetch("/api/ingest/steps/token", {
        method: "GET",
        credentials: "include",
      });
      const text = await resp.text();
      let json: StepsIngestInfo & { error?: string } = { ingestUrl: "", notes: [] };
      if (text) {
        try {
          json = JSON.parse(text) as StepsIngestInfo & { error?: string };
        } catch {
          throw new Error(
            `Connect failed (HTTP ${resp.status}). If you are signed in, try refreshing the page.`,
          );
        }
      }
      if (!resp.ok) {
        throw new Error(json.error ?? `Could not create ingest token (HTTP ${resp.status})`);
      }
      setStepsIngest({ ingestUrl: json.ingestUrl, notes: json.notes ?? [] });
      setNotice(
        "Your personal Shortcut URL is below — use it with an HTTP POST from Shortcuts (hosted Vercel cannot read files from your Mac or iCloud).",
      );
      router.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not connect Steps");
    } finally {
      setBusy(null);
    }
  }

  async function syncDexcom() {
    setBusy("sync-dexcom");
    setNotice(null);
    try {
      const resp = await fetch("/api/integrations/dexcom/sync?format=json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lookbackDays: 30 }),
      });
      const json = (await resp.json()) as {
        error?: string;
        fetched?: number;
        inserted?: number;
        updated?: number;
      };
      if (!resp.ok) throw new Error(json.error ?? "Dexcom sync failed");
      setNotice(
        `Dexcom sync: fetched ${json.fetched ?? 0}, inserted ${json.inserted ?? 0}, updated ${json.updated ?? 0}.`,
      );
      router.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Dexcom sync failed");
    } finally {
      setBusy(null);
    }
  }

  async function syncShortcutsIcloudFile() {
    setBusy("sync-shortcuts-file");
    setNotice(null);
    try {
      const resp = await fetch("/api/import/health-sync", {
        method: "POST",
        credentials: "include",
      });
      const text = await resp.text();
      let json: {
        ok?: boolean;
        error?: string;
        steps?: number;
        inserted?: number;
        updated?: number;
        buckets?: number;
        lineCount?: number;
        filePath?: string;
      } = {};
      if (text) {
        try {
          json = JSON.parse(text) as typeof json;
        } catch {
          throw new Error(
            resp.status === 401
              ? "Sign in expired — refresh the page and try again."
              : `Pull file failed (HTTP ${resp.status}). Response was not JSON — check the server terminal for errors.`,
          );
        }
      }
      if (!resp.ok) {
        const detail = json.filePath ? ` (${json.filePath})` : "";
        throw new Error((json.error ?? "Shortcuts file sync failed") + detail);
      }
      if (json.lineCount != null) {
        setNotice(
          `Pulled ${json.filePath ? `${json.filePath} · ` : ""}${json.lineCount} lines → ${json.buckets ?? 0} hourly buckets (${json.inserted ?? 0} new, ${json.updated ?? 0} updated). Steps today (CSV zone): ${json.steps ?? 0}.`,
        );
      } else {
        setNotice(
          `Pulled ${json.filePath ? `${json.filePath} · ` : ""}digit-only file → ${json.steps ?? 0} steps (midnight bucket in CSV timezone).`,
        );
      }
      router.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Shortcuts file sync failed");
    } finally {
      setBusy(null);
    }
  }

  async function syncStrava() {
    setBusy("sync-strava");
    setNotice(null);
    try {
      const resp = await fetch("/api/integrations/strava/sync?format=json", {
        method: "POST",
      });
      const json = (await resp.json()) as {
        error?: string;
        fetched?: number;
        inserted?: number;
        updated?: number;
        lookbackDays?: number;
      };
      if (!resp.ok) throw new Error(json.error ?? "Strava sync failed");
      setNotice(
        `Strava sync (${json.lookbackDays ?? 30}d window): fetched ${json.fetched ?? 0}, inserted ${json.inserted ?? 0}, updated ${json.updated ?? 0}.`,
      );
      router.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Strava sync failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="w-full rounded-2xl border border-align-border/90 bg-white/90 p-5 ring-1 ring-black/[0.03]">
      <h2 className="text-lg font-semibold tracking-tight">Integrations</h2>

      {notice ? (
        <p
          className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800"
          role="status"
          aria-live="polite"
        >
          {notice}
        </p>
      ) : null}

      <div className="mt-5 space-y-4">
        {/* Dexcom */}
        <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-zinc-900">Dexcom</p>
              <p className="mt-1 text-xs text-zinc-500">
                {initial.dexcom.connected ? (
                  initial.dexcom.shareCredentialsMode ? (
                    <>
                      Connected · {initial.dexcom.readingCount.toLocaleString()} readings · Last data
                      sync: {formatWhen(initial.dexcom.lastSyncAt)}
                    </>
                  ) : (
                    <>
                      Connected · {initial.dexcom.readingCount.toLocaleString()} readings · Last data
                      sync: {formatWhen(initial.dexcom.lastSyncAt)}
                    </>
                  )
                ) : initial.dexcom.shareCredentialsMode && initial.dexcom.shareUiDismissed ? (
                  <>
                    Dexcom Share is configured on the server, but disconnected for this account. Show
                    Dexcom Share or Connect with OAuth.
                  </>
                ) : (
                  <>Not connected.</>
                )}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              {!initial.dexcom.connected ? (
                <>
                  {initial.dexcom.shareCredentialsMode && initial.dexcom.shareUiDismissed ? (
                    <button
                      type="button"
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm transition hover:bg-zinc-50 disabled:opacity-50"
                      disabled={busy !== null}
                      onClick={() => void showDexcomShareAgain()}
                    >
                      {busy === "show-dexcom-share" ? "Restoring…" : "Show Dexcom Share"}
                    </button>
                  ) : null}
                  <a
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm transition hover:bg-zinc-50"
                    href={`/api/integrations/dexcom/connect?return_to=${SETTINGS_RETURN}`}
                  >
                    Connect
                  </a>
                </>
              ) : initial.dexcom.shareCredentialsMode ? (
                <>
                  <button
                    type="button"
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm transition hover:bg-zinc-50 disabled:opacity-50"
                    disabled={busy !== null}
                    onClick={() => void syncDexcom()}
                  >
                    {busy === "sync-dexcom" ? "Syncing…" : "Sync"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                    disabled={busy !== null}
                    onClick={() => void disconnect("dexcom")}
                  >
                    {busy === "disconnect-dexcom" ? "Disconnecting…" : "Disconnect"}
                  </button>
                </>
              ) : (
                <>
                  <a
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm transition hover:bg-zinc-50"
                    href={`/api/integrations/dexcom/connect?return_to=${SETTINGS_RETURN}`}
                  >
                    Reconnect
                  </a>
                  <button
                    type="button"
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm transition hover:bg-zinc-50 disabled:opacity-50"
                    disabled={busy !== null}
                    onClick={() => void syncDexcom()}
                  >
                    {busy === "sync-dexcom" ? "Syncing…" : "Sync"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                    disabled={busy !== null}
                    onClick={() => void disconnect("dexcom")}
                  >
                    Disconnect
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Strava */}
        <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-zinc-900">Strava</p>
              <p className="mt-1 text-xs text-zinc-500">
                {initial.strava.connected ? (
                  <>
                    Connected · {initial.strava.activityCount.toLocaleString()} activities · Last
                    activity sync: {formatWhen(initial.strava.lastSyncAt)}
                  </>
                ) : (
                  <>Not connected.</>
                )}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              {!initial.strava.connected ? (
                <a
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm transition hover:bg-zinc-50"
                  href={`/api/integrations/strava/connect?return_to=${SETTINGS_RETURN}`}
                >
                  Connect
                </a>
              ) : (
                <>
                  <button
                    type="button"
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm transition hover:bg-zinc-50 disabled:opacity-50"
                    disabled={busy !== null}
                    onClick={() => void syncStrava()}
                  >
                    {busy === "sync-strava" ? "Syncing…" : "Sync"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                    disabled={busy !== null}
                    onClick={() => void disconnect("strava")}
                  >
                    Disconnect
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Apple Steps */}
        <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-zinc-900">Apple Steps</p>
              <p className="mt-1 text-xs text-zinc-500">
                {initial.steps.connected ? (
                  <>
                    Personal Shortcut POST URL is active — each user has a different path after{" "}
                    <code className="rounded bg-zinc-100 px-1 text-[10px]">/api/ingest/steps/</code>.
                    DB: {initial.steps.stepsTotalStored.toLocaleString()} step-count sum · Last ingest:{" "}
                    {formatWhen(initial.steps.lastIngestAt)}
                  </>
                ) : (
                  <>
                    <span className="font-medium text-zinc-700">Hosted (e.g. Vercel):</span> use Apple
                    Shortcuts to POST step data to your personal URL after you connect — the server
                    cannot read <code className="rounded bg-zinc-100 px-1 text-[10px]">Timestamp, Steps.txt</code>{" "}
                    from iCloud. <span className="font-medium text-zinc-700">Local dev only:</span>{" "}
                    Pull file reads{" "}
                    <code className="rounded bg-zinc-100 px-1 text-[10px]">ICLOUD_STEPS_JSON_PATH</code> /{" "}
                    <code className="rounded bg-zinc-100 px-1 text-[10px]">SHORTCUTS_STEPS_FILE_PATH</code> on
                    the machine running this app.
                  </>
                )}
              </p>
              {initial.steps.connected && stepsIngest ? (
                <div className="mt-3 space-y-2 rounded-lg border border-emerald-200/80 bg-white/90 p-3 text-xs text-zinc-700">
                  <p className="font-semibold text-zinc-900">Shortcuts setup (works for every user)</p>
                  <p>
                    Copy <span className="font-medium">your</span> URL — it ties steps to this account only.
                    Other people sign in, connect here, and put <span className="font-medium">their</span> URL
                    in their own Shortcut.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <code className="min-w-0 flex-1 break-all rounded-md bg-zinc-100 px-2 py-1.5 text-[11px] leading-snug text-zinc-800">
                      {stepsIngest.ingestUrl}
                    </code>
                    <button
                      type="button"
                      className="shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                      onClick={() => {
                        void navigator.clipboard.writeText(stepsIngest.ingestUrl).then(() => {
                          setCopyFlash(true);
                          window.setTimeout(() => setCopyFlash(false), 2000);
                        });
                      }}
                    >
                      {copyFlash ? "Copied" : "Copy URL"}
                    </button>
                  </div>
                  <p className="text-zinc-600">
                    In Shortcuts → <span className="font-medium">Get Contents of URL</span>: method{" "}
                    <span className="font-medium">POST</span>, add header{" "}
                    <code className="rounded bg-zinc-100 px-1">X-Shortcut-Secret</code> — value must match
                    what your Align host set as <code className="rounded bg-zinc-100 px-1">STEPS_INGEST_SECRET</code>{" "}
                    (or <code className="rounded bg-zinc-100 px-1">AUTH_SECRET</code>). Everyone uses the same
                    header value; the URL path is what identifies each user.
                  </p>
                  <p className="text-zinc-600">
                    Body: JSON <code className="rounded bg-zinc-100 px-1">{"{ \"timestamp\": \"…ISO…\", \"steps\": 123 }"}</code>{" "}
                    or <code className="rounded bg-zinc-100 px-1">{"{ \"samples\": […] }"}</code> (see API notes
                    below).
                  </p>
                  {stepsIngest.notes.length > 0 ? (
                    <ul className="list-inside list-disc space-y-0.5 text-zinc-600">
                      {stepsIngest.notes.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <button
                type="button"
                title="Only use when Next.js runs on a Mac (or server) that has your Shortcuts file path in env — not on Vercel."
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-900 transition hover:bg-emerald-100 disabled:opacity-50"
                disabled={busy !== null}
                onClick={() => void syncShortcutsIcloudFile()}
              >
                {busy === "sync-shortcuts-file" ? "Pulling…" : "Pull file"}
              </button>
              {!initial.steps.connected ? (
                <button
                  type="button"
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm transition hover:bg-zinc-50 disabled:opacity-50"
                  disabled={busy !== null}
                  onClick={() => void connectSteps()}
                >
                  {busy === "connect-steps" ? "Connecting…" : "Connect Shortcut URL"}
                </button>
              ) : (
                <button
                  type="button"
                  className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                  disabled={busy !== null}
                  onClick={() => void disconnect("steps")}
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
