"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import { LightToast } from "@/components/light-toast";
import { uiPanelSurface } from "@/lib/ui-surfaces";

function readBrowserOrigin(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin.replace(/\/$/, "");
}

const SETTINGS_RETURN = encodeURIComponent("/settings");
const primaryButtonClass =
  "inline-flex min-h-10 min-w-[6.75rem] items-center justify-center rounded-full bg-align-forest px-3 py-1.5 text-sm font-semibold text-white shadow-sm shadow-black/10 transition hover:bg-align-forest-muted disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass =
  "inline-flex min-h-10 min-w-[6.75rem] items-center justify-center rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryIconButtonClass =
  "inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border border-zinc-200 bg-white px-2 py-1 text-sm leading-none text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50";
/** Same footprint as Connect (`primaryButtonClass`) — Dexcom/Strava Sync and Apple Steps Pull. */
const syncButtonClass = primaryButtonClass;
const APPLE_STEPS_SHORTCUT_URL = "https://www.icloud.com/shortcuts/02888480a1514ea2afd0fd12288c4244";

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

function noopSubscribe() {
  return () => {};
}

function snapshotBrowserIsLocalDev() {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1";
}

function serverSnapshotBrowserIsLocalDev() {
  return false;
}

function stepsSourceLabel(source: string) {
  switch (source) {
    case "apple_shortcuts":
      return "Shortcut POST";
    case "shortcuts_file":
      return "Shortcuts file sync";
    case "filled_zero":
      return "No ingest (chart gap)";
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

function IntegrationPrimaryLink({
  readOnly,
  href,
  children,
}: {
  readOnly: boolean;
  href: string;
  children: ReactNode;
}) {
  if (readOnly) {
    return (
      <span
        className={`${primaryButtonClass} cursor-not-allowed opacity-55`}
        title="Sign in to Align (outside this demo) to connect accounts."
      >
        {children}
      </span>
    );
  }
  return (
    <a className={primaryButtonClass} href={href}>
      {children}
    </a>
  );
}

type SettingsIntegrationsProps = {
  initial: IntegrationSnapshot;
  /** When true, shows the same integration UI but blocks OAuth, sync, and disconnect actions (demo tour). */
  readOnly?: boolean;
};

export function SettingsIntegrations({ initial, readOnly = false }: SettingsIntegrationsProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** Fresh DB read after Pull / local file sync — avoids stale RSC payload from router.refresh() alone. */
  const [stepsLive, setStepsLive] = useState<IntegrationSnapshot["steps"] | null>(null);
  const stepsDisplay = stepsLive ?? initial.steps;
  const [openOverflow, setOpenOverflow] = useState<"dexcom" | "strava" | "steps" | null>(null);
  const [stepsIngest, setStepsIngest] = useState<StepsIngestInfo | null>(null);
  const controlsLocked = readOnly || busy !== null;
  const [copyFlash, setCopyFlash] = useState(false);
  const [stepsIngestModalOpen, setStepsIngestModalOpen] = useState(false);
  /** Matches `/api/day` streams.hourlySteps for today (local TZ) — same as the home Daily chart. */
  const [todayChartBuckets, setTodayChartBuckets] = useState<
    Array<{ bucketStart: string; stepCount: number; source: string }>
  | null>(null);
  const [todayChartBucketsError, setTodayChartBucketsError] = useState<string | null>(null);
  const [stepsSetupOpen, setStepsSetupOpen] = useState(false);
  const stepsSetupPanelId = useId();
  const [stepsClientHints, setStepsClientHints] = useState<{
    browserOrigin: string | null;
    ingestOriginMismatch: boolean;
  }>({ browserOrigin: null, ingestOriginMismatch: false });
  /** Whether Settings was opened on localhost (file sync) vs hosted (copy ingest URL). */
  const browserIsLocalDev = useSyncExternalStore(
    noopSubscribe,
    snapshotBrowserIsLocalDev,
    serverSnapshotBrowserIsLocalDev,
  );
  const mostRecentIngest = stepsDisplay.recentRows[0] ?? null;
  const chartCoverageRows = useMemo(() => {
    const byBucket = new Map(
      stepsDisplay.recentRows.map((r) => [r.bucketStartIso, r] as const),
    );
    const now = new Date();
    now.setUTCMinutes(0, 0, 0);
    const rows: Array<{
      bucketStartIso: string;
      stepCount: number | null;
      source: string | null;
      hasData: boolean;
    }> = [];
    for (let i = 0; i < 24; i += 1) {
      const bucket = new Date(now.getTime() - i * 60 * 60 * 1000).toISOString();
      const hit = byBucket.get(bucket);
      rows.push({
        bucketStartIso: bucket,
        stepCount: hit?.stepCount ?? null,
        source: hit?.source ?? null,
        hasData: Boolean(hit),
      });
    }
    return rows;
  }, [stepsDisplay.recentRows]);

  /** Drop client overlay once the server RSC payload catches up with a newer last-write time. */
  useEffect(() => {
    startTransition(() => {
      setStepsLive(null);
    });
  }, [initial.steps.lastIngestAt, startTransition]);

  const closeStepsIngestModal = useCallback(() => {
    setStepsIngestModalOpen(false);
    setTodayChartBuckets(null);
    setTodayChartBucketsError(null);
  }, []);

  useEffect(() => {
    if (!stepsIngestModalOpen) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setTodayChartBucketsError(null);
    });
    void fetch(`/api/day?timeZone=${encodeURIComponent(tz)}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (r) => {
        const j = (await r.json()) as {
          error?: string;
          streams?: {
            hourlySteps?: Array<{
              bucketStart: string | Date;
              stepCount: number;
              source: string;
            }>;
          };
        };
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        const hourly = j.streams?.hourlySteps ?? [];
        const normalized = hourly.map((row) => ({
          bucketStart:
            typeof row.bucketStart === "string"
              ? row.bucketStart
              : new Date(row.bucketStart).toISOString(),
          stepCount: row.stepCount,
          source: row.source,
        }));
        if (!cancelled) {
          setTodayChartBuckets(normalized.slice().reverse());
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setTodayChartBuckets(null);
          setTodayChartBucketsError(
            e instanceof Error ? e.message : "Could not load chart buckets",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [stepsIngestModalOpen]);

  function showSuccessToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  }

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
    if (readOnly) {
      if (!initial.steps.connected) {
        setStepsIngest(null);
        return null;
      }
      const origin = readBrowserOrigin();
      const info: StepsIngestInfo = {
        ingestUrl: origin
          ? `${origin}/api/ingest/steps/your-personal-token`
          : "https://your-app.example.com/api/ingest/steps/your-personal-token",
        notes: [
          "Demo: read-only. Sign in to Align (outside this tour) to create a real ingest URL tied to your account.",
        ],
      };
      setStepsIngest(info);
      return info;
    }
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
  }, [initial.steps.connected, readOnly]);

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
    if (readOnly) return;
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
        showSuccessToast("Dexcom Share disconnected.");
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
      showSuccessToast(`${kind === "steps" ? "Steps ingest" : kind} disconnected.`);
      router.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setBusy(null);
    }
  }

  async function showDexcomShareAgain() {
    if (readOnly) return;
    setBusy("show-dexcom-share");
    setNotice(null);
    try {
      const resp = await fetch("/api/integrations/dexcom/share-ui", { method: "DELETE" });
      const json = (await resp.json()) as { error?: string };
      if (!resp.ok) throw new Error(json.error ?? "Could not restore Dexcom Share");
      showSuccessToast("Dexcom Share is active again.");
      router.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not restore Dexcom Share");
    } finally {
      setBusy(null);
    }
  }

  async function connectSteps() {
    if (readOnly) return;
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
      showSuccessToast("Apple Steps connected.");
      router.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not connect Steps");
    } finally {
      setBusy(null);
    }
  }

  function isLocalhostBrowser(): boolean {
    if (typeof window === "undefined") return false;
    const h = window.location.hostname;
    return h === "localhost" || h === "127.0.0.1";
  }

  async function fetchStepsSnapshot(): Promise<IntegrationSnapshot["steps"]> {
    const resp = await fetch("/api/settings/steps-snapshot", {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await resp.json()) as {
      steps?: IntegrationSnapshot["steps"];
      error?: string;
    };
    if (!resp.ok) throw new Error(json.error ?? "Could not load steps");
    if (!json.steps) throw new Error("Could not load steps");
    return json.steps;
  }

  /** Re-fetch Settings data so charts and stats reflect your most recent Shortcut POST to the server. */
  async function pullSteps() {
    if (readOnly) return;
    setBusy("pull-steps");
    setNotice(null);
    setOpenOverflow(null);
    try {
      const steps = await fetchStepsSnapshot();
      setStepsLive(steps);
      await fetchStepsIngestInfo();
      router.refresh();
      showSuccessToast("Reloaded step data from your latest Shortcut ingest.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not reload steps");
    } finally {
      setBusy(null);
    }
  }

  /**
   * Dev: import from the Shortcuts file on this machine. Hosted: copy your personal POST URL
   * (same as Copy URL in setup details).
   */
  async function localSyncSteps() {
    if (readOnly) return;
    setBusy("local-sync-steps");
    setNotice(null);
    setOpenOverflow(null);
    try {
      const info = await fetchStepsIngestInfo();
      if (!info?.ingestUrl) {
        throw new Error("Could not load your ingest URL. Try Connect, then again.");
      }

      // Hosted (Vercel, etc.): no filesystem — Shortcuts must POST to the personal URL; match "Copy URL".
      if (!isLocalhostBrowser()) {
        await navigator.clipboard.writeText(info.ingestUrl);
        setCopyFlash(true);
        window.setTimeout(() => setCopyFlash(false), 2000);
        showSuccessToast(
          "Copied your Shortcut POST URL. Run the Shortcut on your phone — the server can’t read iCloud files.",
        );
        router.refresh();
        return;
      }

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
        error?: string;
      };
      if (!resp.ok || !json.ok) {
        throw new Error(json.error ?? "Local sync failed");
      }
      showSuccessToast(
        `Local sync done: +${json.inserted ?? 0} new, ${json.updated ?? 0} updated.`,
      );
      await loadStepsIngestInfo();
      try {
        setStepsLive(await fetchStepsSnapshot());
      } catch {
        /* snapshot optional if DB busy */
      }
      router.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Local sync failed");
    } finally {
      setBusy(null);
    }
  }

  async function syncDexcom(lookbackDays?: number) {
    if (readOnly) return;
    setBusy(`sync-dexcom-${lookbackDays ?? "auto"}`);
    setNotice(null);
    setOpenOverflow(null);
    try {
      const body = lookbackDays == null ? {} : { lookbackDays };
      const resp = await fetch("/api/integrations/dexcom/sync?format=json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await resp.json()) as {
        error?: string;
        fetched?: number;
        inserted?: number;
        updated?: number;
        unchanged?: number;
      };
      if (!resp.ok) throw new Error(json.error ?? "Dexcom sync failed");
      showSuccessToast(
        `Dexcom sync done: +${json.inserted ?? 0} new, ${json.updated ?? 0} updated.`,
      );
      router.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Dexcom sync failed");
    } finally {
      setBusy(null);
    }
  }

  async function syncStrava(lookbackDays?: number) {
    if (readOnly) return;
    setBusy(`sync-strava-${lookbackDays ?? "auto"}`);
    setNotice(null);
    setOpenOverflow(null);
    try {
      const body = lookbackDays == null ? {} : { lookbackDays };
      const resp = await fetch("/api/integrations/strava/sync?format=json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
      showSuccessToast(
        `Strava sync done: +${json.inserted ?? 0} new, ${json.updated ?? 0} updated.`,
      );
      router.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Strava sync failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={`w-full p-5 ${uiPanelSurface}`}>
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-align-muted">
        Integrations
      </h2>
      {readOnly ? (
        <p className="mt-2 text-sm text-zinc-600">
          This tour is read-only. Sign in to Align to connect Dexcom, Strava, and Apple Steps for real.
        </p>
      ) : null}

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
            <div className="relative flex shrink-0 flex-wrap justify-end gap-2">
              {!initial.dexcom.connected ? (
                <>
                  {initial.dexcom.shareCredentialsMode && initial.dexcom.shareUiDismissed ? (
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      disabled={controlsLocked}
                      onClick={() => void showDexcomShareAgain()}
                    >
                      {busy === "show-dexcom-share" ? "Restoring…" : "Show Dexcom Share"}
                    </button>
                  ) : null}
                  <IntegrationPrimaryLink
                    readOnly={readOnly}
                    href={`/api/integrations/dexcom/connect?return_to=${SETTINGS_RETURN}`}
                  >
                    Connect
                  </IntegrationPrimaryLink>
                </>
              ) : initial.dexcom.shareCredentialsMode ? (
                <>
                  <button
                    type="button"
                    className={syncButtonClass}
                    disabled={controlsLocked}
                    onClick={() => void syncDexcom()}
                  >
                    {busy?.startsWith("sync-dexcom") ? "Syncing…" : "Sync"}
                  </button>
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={openOverflow === "dexcom"}
                    className={secondaryIconButtonClass}
                    disabled={controlsLocked}
                    onClick={() =>
                      setOpenOverflow((v) => (v === "dexcom" ? null : "dexcom"))
                    }
                  >
                    …
                  </button>
                </>
              ) : (
                <>
                  <IntegrationPrimaryLink
                    readOnly={readOnly}
                    href={`/api/integrations/dexcom/connect?return_to=${SETTINGS_RETURN}`}
                  >
                    Connect
                  </IntegrationPrimaryLink>
                  <button
                    type="button"
                    className={syncButtonClass}
                    disabled={controlsLocked}
                    onClick={() => void syncDexcom()}
                  >
                    {busy?.startsWith("sync-dexcom") ? "Syncing…" : "Sync"}
                  </button>
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={openOverflow === "dexcom"}
                    className={secondaryIconButtonClass}
                    disabled={controlsLocked}
                    onClick={() =>
                      setOpenOverflow((v) => (v === "dexcom" ? null : "dexcom"))
                    }
                  >
                    …
                  </button>
                </>
              )}
              {openOverflow === "dexcom" ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-lg"
                >
                  <button
                    type="button"
                    className="min-h-10 w-full rounded-full px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                    disabled={controlsLocked}
                    onClick={() => void syncDexcom(90)}
                  >
                    Sync last 90 days
                  </button>
                  <button
                    type="button"
                    className="mt-1 min-h-10 w-full rounded-full px-2 py-1.5 text-left text-sm text-red-700 hover:bg-red-50"
                    disabled={controlsLocked}
                    onClick={() => {
                      setOpenOverflow(null);
                      void disconnect("dexcom");
                    }}
                  >
                    {busy === "disconnect-dexcom" ? "Disconnecting…" : "Disconnect"}
                  </button>
                </div>
              ) : null}
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
            <div className="relative flex shrink-0 flex-wrap justify-end gap-2">
              {!initial.strava.connected ? (
                <IntegrationPrimaryLink
                  readOnly={readOnly}
                  href={`/api/integrations/strava/connect?return_to=${SETTINGS_RETURN}`}
                >
                  Connect
                </IntegrationPrimaryLink>
              ) : (
                <>
                  <button
                    type="button"
                    className={syncButtonClass}
                    disabled={controlsLocked}
                    onClick={() => void syncStrava()}
                  >
                    {busy?.startsWith("sync-strava") ? "Syncing…" : "Sync"}
                  </button>
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={openOverflow === "strava"}
                    className={secondaryIconButtonClass}
                    disabled={controlsLocked}
                    onClick={() =>
                      setOpenOverflow((v) => (v === "strava" ? null : "strava"))
                    }
                  >
                    …
                  </button>
                </>
              )}
              {openOverflow === "strava" ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-lg"
                >
                  <button
                    type="button"
                    className="min-h-10 w-full rounded-full px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                    disabled={controlsLocked}
                    onClick={() => void syncStrava(90)}
                  >
                    Sync last 90 days
                  </button>
                  <button
                    type="button"
                    className="mt-1 min-h-10 w-full rounded-full px-2 py-1.5 text-left text-sm text-red-700 hover:bg-red-50"
                    disabled={controlsLocked}
                    onClick={() => {
                      setOpenOverflow(null);
                      void disconnect("strava");
                    }}
                  >
                    {busy === "disconnect-strava" ? "Disconnecting…" : "Disconnect"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Apple Steps */}
        <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
          <div className="flex flex-col gap-3">
            <div className="min-w-0">
              <p className="font-medium text-zinc-900">Apple Steps</p>
              <p className="mt-1 text-xs text-zinc-500">
                {stepsDisplay.connected ? (
                  <>
                    Personal Shortcut POST URL is active — each user has a different path after{" "}
                    <code className="rounded bg-zinc-100 px-1 text-[10px]">/api/ingest/steps/</code>.
                    DB: {stepsDisplay.stepsTotalStored.toLocaleString()} step-count sum · Last write:{" "}
                    {formatWhen(stepsDisplay.lastIngestAt)}.
                    {stepsDisplay.lastStored ? (
                      <span className="mt-2 block text-zinc-600">
                        <span className="font-medium text-zinc-800">Latest stored hour:</span>{" "}
                        {stepsDisplay.lastStored.stepCount.toLocaleString()} steps · UTC bucket start{" "}
                        {formatWhen(stepsDisplay.lastStored.bucketStartIso)} ·{" "}
                        {stepsSourceLabel(stepsDisplay.lastStored.source)} · received{" "}
                        {formatWhen(stepsDisplay.lastStored.receivedAtIso)}
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
            <div className="relative flex w-full items-start gap-2">
              {!stepsDisplay.connected ? (
                <button
                  type="button"
                  className={primaryButtonClass}
                  disabled={controlsLocked}
                  onClick={() => void connectSteps()}
                >
                  {busy === "connect-steps" ? "Connecting…" : "Connect"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className={syncButtonClass}
                    disabled={controlsLocked}
                    title="Reload this page’s step counts from the server (after your Shortcut POSTs)"
                    onClick={() => void pullSteps()}
                  >
                    {busy === "pull-steps" ? "Pulling…" : "Pull"}
                  </button>
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={openOverflow === "steps"}
                    className={secondaryIconButtonClass}
                    disabled={controlsLocked}
                    onClick={() => setOpenOverflow((v) => (v === "steps" ? null : "steps"))}
                  >
                    …
                  </button>
                </>
              )}
              {openOverflow === "steps" ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-20 mt-1 min-w-[11rem] rounded-lg border border-zinc-200 bg-white p-1.5 shadow-lg"
                >
                  <button
                    type="button"
                    className="min-h-10 w-full rounded-full px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                    disabled={controlsLocked}
                    title={
                      browserIsLocalDev
                        ? "Import steps from the Shortcuts file on this machine"
                        : "Copy your personal Shortcut POST URL (same as Copy URL below)"
                    }
                    onClick={() => void localSyncSteps()}
                  >
                    {busy === "local-sync-steps"
                      ? browserIsLocalDev
                        ? "Syncing…"
                        : "Copying…"
                      : "Local Sync"}
                  </button>
                  <button
                    type="button"
                    className="mt-1 min-h-10 w-full rounded-full px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                    disabled={controlsLocked}
                    onClick={() => {
                      setOpenOverflow(null);
                      setStepsIngestModalOpen(true);
                    }}
                  >
                    View latest ingest
                  </button>
                  <button
                    type="button"
                    className="mt-1 min-h-10 w-full rounded-full px-2 py-1.5 text-left text-sm text-red-700 hover:bg-red-50"
                    disabled={controlsLocked}
                    onClick={() => {
                      setOpenOverflow(null);
                      void disconnect("steps");
                    }}
                  >
                    {busy === "disconnect-steps" ? "Disconnecting…" : "Disconnect"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          {stepsDisplay.connected && stepsIngest ? (
            <div className="mt-3 w-full min-w-0 border-t border-align-border-soft pt-3 text-xs text-zinc-700">
              <button
                type="button"
                aria-expanded={stepsSetupOpen}
                aria-controls={stepsSetupPanelId}
                aria-label={stepsSetupOpen ? "Collapse setup details" : "Learn more about Apple Steps setup"}
                className="group inline-flex min-h-10 items-center gap-1 rounded-full px-1.5 py-1 text-left text-sm font-semibold text-align-forest transition hover:text-align-forest-muted disabled:cursor-not-allowed disabled:opacity-50"
                disabled={busy !== null}
                onClick={() => setStepsSetupOpen((v) => !v)}
              >
                <span>{stepsSetupOpen ? "Hide details" : "Learn more"}</span>
                <span
                  className="text-base leading-none text-align-muted transition group-hover:text-align-forest"
                  aria-hidden
                >
                  {stepsSetupOpen ? "▾" : "▸"}
                </span>
              </button>
              {stepsSetupOpen ? (
                <div id={stepsSetupPanelId} className="mt-2 space-y-2">
                  <p className="font-semibold text-zinc-900">Shortcuts setup (works for every user)</p>
                  <p>
                    Start by installing this shortcut on iPhone:{" "}
                    {readOnly ? (
                      <span
                        className="font-medium text-zinc-500 underline decoration-zinc-300 underline-offset-2"
                        title="Sign in to Align to install the Shortcut on your phone."
                      >
                        Get Shortcut
                      </span>
                    ) : (
                      <a
                        href={APPLE_STEPS_SHORTCUT_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium underline underline-offset-2"
                      >
                        Get Shortcut
                      </a>
                    )}
                    .
                  </p>
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
                      className={secondaryButtonClass}
                      disabled={controlsLocked}
                      title="Fetches the latest URL from the server, then copies it"
                      onClick={() => {
                        void (async () => {
                          if (readOnly) return;
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
      {toast ? <LightToast message={toast} /> : null}
      {stepsIngestModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Latest ingest rows"
          onClick={closeStepsIngestModal}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-zinc-900">Latest ingest rows</h3>
              <button
                type="button"
                className="rounded-full border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                onClick={closeStepsIngestModal}
              >
                Close
              </button>
            </div>
            <div className="max-h-[65vh] overflow-auto p-4 text-xs text-zinc-700">
              <div className="space-y-3">
                {stepsDisplay.recentRows.length === 0 ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2 text-amber-950">
                    No hourly rows are stored yet — run your Shortcut or Local Sync first.
                  </p>
                ) : null}
                <div className="rounded-md border border-zinc-200 bg-zinc-50/70 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-700">
                    Today&apos;s hourly buckets (Daily chart)
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-600">
                    Uses your calendar day and timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}), merges
                    Shortcut POST vs file sync when both write the same hour (higher step count wins), then fills empty
                    hours so the chart aligns with this list.
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {todayChartBucketsError ? (
                      <>
                        <p className="text-red-700">{todayChartBucketsError}</p>
                        <p className="text-[11px] text-zinc-500">
                          Fallback: rolling last 24 UTC hours from recent ingests (may not match the Daily chart).
                        </p>
                        <div className="space-y-1.5">
                          {chartCoverageRows.map((row) => (
                            <div
                              key={row.bucketStartIso}
                              className={`flex items-center justify-between rounded px-2 py-1 ${
                                row.hasData ? "bg-white ring-1 ring-zinc-200/80" : "bg-zinc-100/80"
                              }`}
                            >
                              <span className="font-medium">{formatWhen(row.bucketStartIso)}</span>
                              <span className={row.hasData ? "text-zinc-800" : "text-zinc-500"}>
                                {row.hasData
                                  ? `${row.stepCount?.toLocaleString() ?? 0} steps · ${stepsSourceLabel(
                                      row.source ?? "",
                                    )}`
                                  : "No data"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : todayChartBuckets !== null ? (
                      todayChartBuckets.length > 0 ? (
                        todayChartBuckets.map((row) => {
                          const isGap = row.source === "filled_zero";
                          return (
                            <div
                              key={row.bucketStart}
                              className={`flex items-center justify-between rounded px-2 py-1 ${
                                isGap ? "bg-zinc-100/80" : "bg-white ring-1 ring-zinc-200/80"
                              }`}
                            >
                              <span className="font-medium">{formatWhen(row.bucketStart)}</span>
                              <span className={isGap ? "text-zinc-500" : "text-zinc-800"}>
                                {isGap
                                  ? "No ingest yet"
                                  : `${row.stepCount.toLocaleString()} steps · ${stepsSourceLabel(row.source)}`}
                              </span>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-zinc-500">No hourly buckets returned for today.</p>
                      )
                    ) : (
                      <p className="text-zinc-500">Loading chart buckets…</p>
                    )}
                  </div>
                </div>
                {mostRecentIngest ? (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50/70 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                      Most recent ingest
                    </p>
                    <div className="mt-1.5 grid grid-cols-1 gap-1 text-zinc-800 sm:grid-cols-2">
                      <p>
                        <span className="font-medium">Date:</span>{" "}
                        {formatDateOnly(mostRecentIngest.receivedAtIso)}
                      </p>
                      <p>
                        <span className="font-medium">Timestamp:</span>{" "}
                        {formatTimeOnly(mostRecentIngest.receivedAtIso)}
                      </p>
                      <p>
                        <span className="font-medium">Step count:</span>{" "}
                        {mostRecentIngest.stepCount.toLocaleString()}
                      </p>
                      <p>
                        <span className="font-medium">Source:</span>{" "}
                        {stepsSourceLabel(mostRecentIngest.source)}
                      </p>
                    </div>
                  </div>
                ) : null}
                {stepsDisplay.recentRows.length > 0 ? (
                  <>
                    <p className="font-semibold text-zinc-900">Raw ingest rows (newest first)</p>
                    {stepsDisplay.recentRows.map((row, idx) => (
                      <div key={`${row.receivedAtIso}-${idx}`} className="rounded-md border border-zinc-200 p-2">
                        <p>
                          <span className="font-medium text-zinc-900">{row.stepCount.toLocaleString()}</span> steps
                        </p>
                        <p>Bucket start: {formatWhen(row.bucketStartIso)}</p>
                        <p>Source: {stepsSourceLabel(row.source)}</p>
                        <p>Received: {formatWhen(row.receivedAtIso)}</p>
                      </div>
                    ))}
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
