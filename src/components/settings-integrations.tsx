"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { StepIngestUrlCard } from "@/components/step-ingest-url-card";

export type IntegrationSnapshot = {
  dexcom: { connected: boolean; lastSyncAt: string | null };
  strava: { connected: boolean; lastSyncAt: string | null };
  steps: {
    connected: boolean;
    lastIngestAt: string | null;
    ingestUrl: string | null;
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

  async function connectSteps() {
    setBusy("connect-steps");
    setNotice(null);
    try {
      const resp = await fetch("/api/ingest/steps/token", { method: "GET" });
      const json = (await resp.json()) as { error?: string };
      if (!resp.ok) throw new Error(json.error ?? "Could not create ingest token");
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
                  <>Connected · Last data sync: {formatWhen(initial.dexcom.lastSyncAt)}</>
                ) : (
                  <>Not connected</>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!initial.dexcom.connected ? (
                <a
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm transition hover:bg-zinc-50"
                  href={`/api/integrations/dexcom/connect?return_to=${SETTINGS_RETURN}`}
                >
                  Connect
                </a>
              ) : (
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
                  <>Not connected</>
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
            <div>
              <p className="font-medium text-zinc-900">Apple Steps (Shortcuts)</p>
              <p className="mt-1 text-xs text-zinc-500">
                {initial.steps.connected ? (
                  <>Connected · Last ingest: {formatWhen(initial.steps.lastIngestAt)}</>
                ) : (
                  <>Not connected</>
                )}
              </p>
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
