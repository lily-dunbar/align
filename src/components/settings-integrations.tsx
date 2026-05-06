"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";

function readBrowserOrigin(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin.replace(/\/$/, "");
}

const SETTINGS_RETURN = encodeURIComponent("/settings");

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

function formatDateOnly(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return "—";
  }
}

function formatTimeOnly(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return "—";
  }
}

function stepsSourceLabel(source: string) {
  switch (source) {
    case "apple_shortcuts":
      return "Shortcut POST";
    case "shortcuts_file":
      return "Shortcuts file sync";
    case "demo_preview":
      return "Demo preview";
    default:
      return source;
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
    /** Row with max receivedAt in hourly_steps (any source). */
    lastStored: {
      bucketStartIso: string;
      stepCount: number;
      source: string;
      receivedAtIso: string;
    } | null;
    recentRows: Array<{
      bucketStartIso: string;
      stepCount: number;
      source: string;
      receivedAtIso: string;
    }>;
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
  const [stepsIngestModalOpen, setStepsIngestModalOpen] = useState(false);
  const [stepsSetupOpen, setStepsSetupOpen] = useState(false);
  const stepsSetupPanelId = useId();
  const [stepsClientHints, setStepsClientHints] = useState<{
    browserOrigin: string | null;
    ingestOriginMismatch: boolean;
  }>({ browserOrigin: null, ingestOriginMismatch: false });
  const mostRecentIngest = initial.steps.recentRows[0] ?? null;

  useEffect(() => {
    const origin = readBrowserOrigin() || null;
    const host = window.location.hostname;
    let ingestOriginMismatch = false;
    const ingestUrl = stepsIngest?.ingestUrl;
    if (ingestUrl) {
      try {
        const ingest = new URL(ingestUrl);
        const ingestLocal =
          ingest.hostname === "localhost" || ingest.hostname === "127.0.0.1";
        const onPublicHttps =
          window.location.protocol === "https:" &&
          host !== "localhost" &&
          host !== "127.0.0.1";
        ingestOriginMismatch = ingestLocal && onPublicHttps;
      } catch {
        ingestOriginMismatch = false;
      }
    }
    // Client-only: window + ingest URL for Shortcuts panel hints (avoids SSR/hydration fights).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional after mount / when ingest loads
    setStepsClientHints({
      browserOrigin: origin,
      ingestOriginMismatch,
    });
  }, [stepsIngest?.ingestUrl]);

  /** Loads the personal ingest URL from the API (same JSON as Shortcuts should use as the POST base). */
  const fetchStepsIngestInfo = useCallback(async (): Promise<StepsIngestInfo | null> => {
    if (!initial.steps.connected) {
      setStepsIngest(null);
      return null;
    }
    const resp = await fetch("/api/ingest/steps/token", {
      method: "GET",
      credentials: "include",
    });
    const json = (await resp.json()) as StepsIngestInfo & { error?: string };
    if (!resp.ok) throw new Error(json.error ?? "Could not load ingest URL");
    const info: StepsIngestInfo = { ingestUrl: json.ingestUrl, notes: json.notes ?? [] };
    setStepsIngest(info);
    return info;
  }, [initial.steps.connected]);

  const loadStepsIngestInfo = useCallback(async () => {
    try {
      await fetchStepsIngestInfo();
    } catch {
      setStepsIngest(null);
    }
  }, [fetchStepsIngestInfo]);

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
        "Your personal Shortcut URL is below — use POST from Apple Shortcuts to send step samples.",
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
        unchanged?: number;
      };
      if (!resp.ok) throw new Error(json.error ?? "Dexcom sync failed");
      setNotice(
        `Dexcom sync: fetched ${json.fetched ?? 0}, inserted ${json.inserted ?? 0}, updated ${json.updated ?? 0}, unchanged ${json.unchanged ?? 0}.`,
      );
      router.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Dexcom sync failed");
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
        unchanged?: number;
        lookbackDays?: number;
      };
      if (!resp.ok) throw new Error(json.error ?? "Strava sync failed");
      setNotice(
        `Strava sync (${json.lookbackDays ?? 30}d window): fetched ${json.fetched ?? 0}, inserted ${json.inserted ?? 0}, updated ${json.updated ?? 0}, unchanged ${json.unchanged ?? 0}.`,
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
                    Connect
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
            <div className="min-w-0">
              <p className="font-medium text-zinc-900">Apple Steps</p>
              <p className="mt-1 text-xs text-zinc-500">
                {initial.steps.connected ? (
                  <>
                    Personal Shortcut POST URL is active — each user has a different path after{" "}
                    <code className="rounded bg-zinc-100 px-1 text-[10px]">/api/ingest/steps/</code>.
                    DB: {initial.steps.stepsTotalStored.toLocaleString()} step-count sum · Last write:{" "}
                    {formatWhen(initial.steps.lastIngestAt)}.
                    {initial.steps.lastStored ? (
                      <span className="mt-2 block text-zinc-600">
                        <span className="font-medium text-zinc-800">Latest stored hour:</span>{" "}
                        {initial.steps.lastStored.stepCount.toLocaleString()} steps · UTC bucket start{" "}
                        {formatWhen(initial.steps.lastStored.bucketStartIso)} ·{" "}
                        {stepsSourceLabel(initial.steps.lastStored.source)} · received{" "}
                        {formatWhen(initial.steps.lastStored.receivedAtIso)}
                      </span>
                    ) : (
                      <span className="mt-2 block text-amber-800/90">
                        No hourly step rows yet — run your Shortcut (POST) to ingest steps.
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    Apple Shortcuts must{" "}
                    <span className="font-medium text-zinc-700">POST</span> step data to your personal ingest URL after
                    you connect. The app does not pull step files from your phone or iCloud.
                  </>
                )}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
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
                    title="Show latest ingested rows"
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm transition hover:bg-zinc-50 disabled:opacity-50"
                    disabled={busy !== null}
                    onClick={() => setStepsIngestModalOpen(true)}
                  >
                    View latest ingest
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
          {initial.steps.connected && stepsIngest ? (
            <div className="mt-3 w-full min-w-0 border-t border-align-border-soft pt-3 text-xs text-zinc-700">
              <button
                type="button"
                aria-expanded={stepsSetupOpen}
                aria-controls={stepsSetupPanelId}
                aria-label={
                  stepsSetupOpen
                    ? "Collapse Shortcuts setup instructions"
                    : "Set up — Shortcuts URL and hosting notes"
                }
                onClick={() => setStepsSetupOpen((v) => !v)}
                className="group flex w-full items-center justify-between gap-2 rounded-md px-0 py-0.5 text-left text-sm font-semibold text-align-forest transition hover:text-align-forest-muted"
              >
                <span>Set up</span>
                <span
                  className="text-2xl leading-none text-align-muted transition group-hover:text-align-forest sm:text-[1.75rem]"
                  aria-hidden
                >
                  {stepsSetupOpen ? "▾" : "▸"}
                </span>
              </button>
              {stepsSetupOpen ? (
                <div id={stepsSetupPanelId} className="mt-3 space-y-2">
                  <p className="font-semibold text-zinc-900">Shortcuts setup (works for every user)</p>
                  <p>
                    Copy <span className="font-medium">your</span> URL — it ties steps to this account only. Other
                    people sign in, connect here, and put <span className="font-medium">their</span> URL in their
                    own Shortcut.
                  </p>
                  <div className="rounded-lg border border-zinc-200/90 bg-zinc-50/90 px-3 py-2 text-zinc-700">
                    <p className="font-medium text-zinc-800">Vercel / production host</p>
                    <p className="mt-1 leading-relaxed">
                      This link always starts with your app&apos;s{" "}
                      <span className="font-medium text-zinc-900">public HTTPS address</span> (not your phone). In
                      Vercel go to{" "}
                      <span className="font-medium text-zinc-900">Project → Settings → Environment Variables</span>{" "}
                      and set:
                    </p>
                    <code className="mt-2 block rounded-md bg-white px-2 py-1.5 font-mono text-[11px] text-zinc-800 ring-1 ring-zinc-200/80">
                      {`AUTH_URL=${
                        stepsClientHints.browserOrigin &&
                        stepsClientHints.browserOrigin.startsWith("https:")
                          ? stepsClientHints.browserOrigin
                          : "https://your-project.vercel.app"
                      }`}
                    </code>
                    <p className="mt-1.5 text-[11px] text-zinc-600">
                      The <span className="font-medium">Copy URL</span> below uses your{" "}
                      <span className="font-medium">configured app URL</span> (<code className="rounded bg-zinc-200/80 px-1">AUTH_URL</code>, or
                      Vercel&apos;s <code className="rounded bg-zinc-200/80 px-1">VERCEL_URL</code> when unset)—not this browser tab. Set{" "}
                      <code className="rounded bg-zinc-200/80 px-1">AUTH_URL</code> to your production HTTPS origin (no trailing slash), save,
                      then redeploy so ingest and OAuth stay aligned.
                    </p>
                  </div>
                  {stepsClientHints.ingestOriginMismatch ? (
                    <div
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950"
                      role="status"
                    >
                      <p className="font-medium">Ingest URL host doesn&apos;t match this site</p>
                      <p className="mt-1 text-amber-900/90">
                        Set <code className="rounded bg-amber-100/80 px-1">AUTH_URL</code> to{" "}
                        <span className="font-mono font-semibold">
                          {stepsClientHints.browserOrigin ?? "this site’s origin"}
                        </span>{" "}
                        in Vercel, redeploy, then refresh this page and copy the URL again.
                      </p>
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <code className="min-w-0 flex-1 break-all rounded-md bg-zinc-100 px-2 py-1.5 text-[11px] leading-snug text-zinc-800">
                      {stepsIngest.ingestUrl}
                    </code>
                    <button
                      type="button"
                      className="shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                      disabled={busy !== null}
                      title="Fetches the latest URL from the server, then copies it"
                      onClick={() => {
                        void (async () => {
                          setBusy("copy-ingest-url");
                          setNotice(null);
                          try {
                            const info = await fetchStepsIngestInfo();
                            if (!info?.ingestUrl) return;
                            await navigator.clipboard.writeText(info.ingestUrl);
                            setCopyFlash(true);
                            window.setTimeout(() => setCopyFlash(false), 2000);
                            router.refresh();
                          } catch {
                            setNotice("Could not load the latest URL. Open Set up below and tap Copy URL again.");
                          } finally {
                            setBusy(null);
                          }
                        })();
                      }}
                    >
                      {busy === "copy-ingest-url"
                        ? "Loading…"
                        : copyFlash
                          ? "Copied"
                          : "Copy URL"}
                    </button>
                  </div>
                  <p className="text-zinc-600">
                    In Shortcuts → <span className="font-medium">Get Contents of URL</span>: method{" "}
                    <span className="font-medium">POST</span>. If you set env{" "}
                    <code className="rounded bg-zinc-100 px-1">STEPS_INGEST_SECRET</code> on the server, add header{" "}
                    <code className="rounded bg-zinc-100 px-1">X-Shortcut-Secret</code> (or{" "}
                    <code className="rounded bg-zinc-100 px-1">Authorization: Bearer …</code>) to that same value. If{" "}
                    <code className="rounded bg-zinc-100 px-1">STEPS_INGEST_SECRET</code> is not set, you do not need a
                    secret header — your personal URL path identifies your account.
                  </p>
                  <p className="text-zinc-600">
                    Body: JSON{" "}
                    <code className="rounded bg-zinc-100 px-1">{"{ \"timestamp\": \"…ISO…\", \"steps\": 123 }"}</code>{" "}
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
          ) : null}
        </div>
      </div>
      {stepsIngestModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Latest ingest rows"
          onClick={() => setStepsIngestModalOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-zinc-900">Latest ingest rows</h3>
              <button
                type="button"
                className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                onClick={() => setStepsIngestModalOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="max-h-[65vh] overflow-auto p-4 text-xs text-zinc-700">
              {initial.steps.recentRows.length === 0 ? (
                <p>No ingest rows yet.</p>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-md border border-emerald-200 bg-emerald-50/70 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                      Most recent ingest
                    </p>
                    <div className="mt-1.5 grid grid-cols-1 gap-1 text-zinc-800 sm:grid-cols-2">
                      <p>
                        <span className="font-medium">Date:</span>{" "}
                        {formatDateOnly(mostRecentIngest?.receivedAtIso ?? null)}
                      </p>
                      <p>
                        <span className="font-medium">Timestamp:</span>{" "}
                        {formatTimeOnly(mostRecentIngest?.receivedAtIso ?? null)}
                      </p>
                      <p>
                        <span className="font-medium">Step count:</span>{" "}
                        {mostRecentIngest?.stepCount?.toLocaleString() ?? "—"}
                      </p>
                      <p>
                        <span className="font-medium">Source:</span>{" "}
                        {mostRecentIngest ? stepsSourceLabel(mostRecentIngest.source) : "—"}
                      </p>
                    </div>
                  </div>
                  {initial.steps.recentRows.map((row, idx) => (
                    <div key={`${row.receivedAtIso}-${idx}`} className="rounded-md border border-zinc-200 p-2">
                      <p>
                        <span className="font-medium text-zinc-900">{row.stepCount.toLocaleString()}</span> steps
                      </p>
                      <p>Bucket start: {formatWhen(row.bucketStartIso)}</p>
                      <p>Source: {stepsSourceLabel(row.source)}</p>
                      <p>Received: {formatWhen(row.receivedAtIso)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
