"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { StepIngestUrlCard } from "@/components/step-ingest-url-card";

export type IntegrationSnapshot = {
  dexcom: {
    connected: boolean;
    lastSyncAt: string | null;
    shareCredentialsMode?: boolean;
    /** True when Share env is set but this user hid the integration (cookie). */
    shareUiDismissed?: boolean;
  };
  strava: { connected: boolean; lastSyncAt: string | null };
  steps: {
    connected: boolean;
    lastIngestAt: string | null;
    ingestUrl: string | null;
    /** False when STEPS_INGEST_SECRET is missing — Shortcuts POSTs will fail. */
    ingestSecretConfigured: boolean;
    /** True when AUTH_URL points at localhost — phone Shortcuts cannot reach it. */
    ingestUrlIsLocalDev: boolean;
  };
};

const SETTINGS_RETURN = encodeURIComponent("/settings");

function formatWhen(iso: string | null) {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

export function SettingsIntegrations({ initial }: { initial: IntegrationSnapshot }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
      let json: { error?: string } = {};
      if (text) {
        try {
          json = JSON.parse(text) as { error?: string };
        } catch {
          throw new Error(
            `Connect failed (HTTP ${resp.status}). If you are signed in, try refreshing the page.`,
          );
        }
      }
      if (!resp.ok) {
        throw new Error(json.error ?? `Could not create ingest token (HTTP ${resp.status})`);
      }
      setNotice("Apple Steps connected. Open View details to copy your ingest URL.");
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

  async function syncSteps() {
    setBusy("sync-steps");
    setNotice(null);
    try {
      router.refresh();
      setNotice(
        "Steps: refreshed status. New step totals appear after your Shortcut POSTs to the ingest URL.",
      );
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
      };
      if (!resp.ok) throw new Error(json.error ?? "Strava sync failed");
      setNotice(
        `Strava sync: fetched ${json.fetched ?? 0}, inserted ${json.inserted ?? 0}, updated ${json.updated ?? 0}.`,
      );
      router.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Strava sync failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="w-full rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight">Integrations</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Connect services, run a sync, and review last update times.
      </p>

      {notice ? (
        <p className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
          {notice}
        </p>
      ) : null}

      <div className="mt-5 space-y-4">
        {/* Dexcom */}
        <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium text-zinc-900">Dexcom</p>
              <p className="mt-1 text-xs text-zinc-500">
                {initial.dexcom.connected ? (
                  initial.dexcom.shareCredentialsMode ? (
                    <>
                      Connected via Dexcom Share (server credentials). Last data sync:{" "}
                      {formatWhen(initial.dexcom.lastSyncAt)}
                    </>
                  ) : (
                    <>
                      Connected · Last data sync: {formatWhen(initial.dexcom.lastSyncAt)}
                    </>
                  )
                ) : initial.dexcom.shareCredentialsMode && initial.dexcom.shareUiDismissed ? (
                  <>
                    Dexcom Share is still configured on the server (PYDEXCOM_*), but you disconnected
                    it for this account. Use Show Dexcom Share to sync again, or Connect for OAuth.
                  </>
                ) : (
                  <>Not connected — use Connect to sign in with Dexcom.</>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
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
            <div>
              <p className="font-medium text-zinc-900">Strava</p>
              <p className="mt-1 text-xs text-zinc-500">
                {initial.strava.connected ? (
                  <>Connected · Last activity sync: {formatWhen(initial.strava.lastSyncAt)}</>
                ) : (
                  <>Not connected — use Connect to sign in with Strava.</>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!initial.strava.connected ? (
                <a
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm transition hover:bg-zinc-50"
                  href={`/api/integrations/strava/connect?return_to=${SETTINGS_RETURN}`}
                >
                  Connect
                </a>
              ) : (
                <>
                  <a
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm transition hover:bg-zinc-50"
                    href={`/api/integrations/strava/connect?return_to=${SETTINGS_RETURN}`}
                  >
                    Reconnect
                  </a>
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

        {/* Steps */}
        <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-zinc-900">Apple Steps (Shortcuts)</p>
              <p className="mt-1 text-xs text-zinc-500">
                {initial.steps.connected ? (
                  <>Connected · Last ingest: {formatWhen(initial.steps.lastIngestAt)}</>
                ) : (
                  <>Not connected — use Connect to enable your ingest URL.</>
                )}
              </p>
              {!initial.steps.ingestSecretConfigured ? (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-950">
                  Add{" "}
                  <code className="rounded bg-amber-100/80 px-1 py-0.5">STEPS_INGEST_SECRET</code>{" "}
                  to your environment (see <code className="rounded bg-amber-100/80 px-1">.env.example</code>
                  ), restart the server, then use the same value as the{" "}
                  <code className="rounded bg-amber-100/80 px-1">X-Shortcut-Secret</code> header in Shortcuts.
                  Without it, posts to the ingest URL return an error.
                </p>
              ) : null}
              {initial.steps.ingestUrlIsLocalDev ? (
                <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs text-sky-950">
                  Your app URL is localhost. Shortcuts on an iPhone cannot reach it. Deploy the app (or use a
                  tunnel), set <code className="rounded bg-sky-100/80 px-1">AUTH_URL</code> to the public
                  <code className="ml-1 rounded bg-sky-100/80 px-1">https://…</code> origin, restart, then use
                  Connect again so the ingest URL is reachable from the device.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {!initial.steps.connected ? (
                <button
                  type="button"
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm transition hover:bg-zinc-50 disabled:opacity-50"
                  disabled={busy !== null}
                  onClick={() => void connectSteps()}
                >
                  {busy === "connect-steps" ? "Connecting…" : "Connect"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm transition hover:bg-zinc-50 disabled:opacity-50"
                    disabled={busy !== null}
                    onClick={() => void syncSteps()}
                  >
                    {busy === "sync-steps" ? "Syncing…" : "Sync"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                    disabled={busy !== null}
                    onClick={() => void disconnect("steps")}
                  >
                    Disconnect
                  </button>
                </>
              )}
            </div>
          </div>

          {initial.steps.connected && initial.steps.ingestUrl ? (
            <details className="group/step-details mt-4 border-t border-zinc-200 pt-4">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-emerald-800 [&::-webkit-details-marker]:hidden">
                <span>View Details</span>
                <span
                  className="text-xs text-zinc-400 transition-transform duration-200 group-open/step-details:rotate-180"
                  aria-hidden
                >
                  ▼
                </span>
              </summary>
              <div className="mt-3">
                <StepIngestUrlCard
                  initialIngestUrl={initial.steps.ingestUrl}
                  tokenEndpoint="/api/ingest/steps/token"
                />
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </section>
  );
}
