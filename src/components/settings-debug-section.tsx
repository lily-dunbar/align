"use client";

import { useCallback, useState } from "react";

type StravaDebugOk = {
  connected?: boolean;
  error?: string;
  appUserId?: string;
  stravaToken?: {
    athleteId?: string | null;
    scope?: string | null;
    expiresAt?: string | null;
    updatedAt?: Date | string;
  };
  database?: { totalStravaActivities?: number };
  stravaApi?: {
    athleteStatus?: number;
    activitiesStatus?: number;
    activitiesReturned?: number;
    athleteSummary?: unknown;
    activitiesSample?: unknown[];
    activitiesRawPreview?: unknown;
  };
};

type StepsDebug = {
  ingest: {
    configured: boolean;
    tokenCreatedAt: string | null;
    tokenUpdatedAt: string | null;
    ingestPath: string | null;
    fullUrlExample: string | null;
  };
  database: {
    hourlyBucketRows: number;
    totalStepsStored: number;
    bySource: { source: string; rows: number; steps: number }[];
  };
  recentBuckets: {
    bucketStart: string;
    stepCount: number;
    source: string;
    receivedAt: string;
  }[];
};

export function SettingsDebugSection() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [strava, setStrava] = useState<StravaDebugOk | null>(null);
  const [steps, setSteps] = useState<StepsDebug | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [sResp, stResp] = await Promise.all([
        fetch("/api/integrations/strava/debug", { cache: "no-store" }),
        fetch("/api/settings/debug/steps", { cache: "no-store" }),
      ]);

      if (sResp.status === 404) {
        const j = (await sResp.json()) as StravaDebugOk;
        setStrava({
          connected: false,
          error: j.error ?? "Strava not connected (no tokens in database).",
        });
      } else if (!sResp.ok) {
        const j = (await sResp.json()) as { error?: string };
        setStrava({
          connected: false,
          error: j.error ?? `Strava debug failed (${sResp.status})`,
        });
      } else {
        setStrava((await sResp.json()) as StravaDebugOk);
      }

      if (!stResp.ok) {
        const j = (await stResp.json()) as { error?: string };
        throw new Error(j.error ?? `Steps debug failed (${stResp.status})`);
      }
      setSteps((await stResp.json()) as StepsDebug);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load debug data");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <section className="w-full rounded-2xl border border-amber-200 bg-amber-50/40 p-5 text-left shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
            Integration debug
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Raw snapshots of Strava API responses vs rows stored here, and hourly step buckets
            ingested from Shortcuts.
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
          disabled={busy}
          onClick={() => void load()}
        >
          {busy ? "Loading…" : strava || steps ? "Refresh" : "Load debug data"}
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {strava ? (
        <div className="mt-5 rounded-xl border border-zinc-200 bg-white p-4">
          <h3 className="font-medium text-zinc-900">Strava</h3>
          {strava.error ? (
            <p className="mt-2 text-sm text-zinc-700">{strava.error}</p>
          ) : (
            <>
              <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                <li>
                  <span className="text-zinc-500">DB activities (Strava): </span>
                  {strava.database?.totalStravaActivities ?? "—"}
                </li>
                <li>
                  <span className="text-zinc-500">Token scope: </span>
                  {strava.stravaToken?.scope ?? "—"}
                </li>
                <li>
                  <span className="text-zinc-500">GET /athlete HTTP: </span>
                  {strava.stravaApi?.athleteStatus ?? "—"}
                </li>
                <li>
                  <span className="text-zinc-500">GET /athlete/activities HTTP: </span>
                  {strava.stravaApi?.activitiesStatus ?? "—"}
                </li>
                <li>
                  <span className="text-zinc-500">Activities returned (API page 1): </span>
                  {strava.stravaApi?.activitiesReturned ?? "—"}
                </li>
              </ul>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-zinc-800">
                  Raw Strava debug JSON
                </summary>
                <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-zinc-950 p-3 text-xs text-zinc-100">
                  {JSON.stringify(strava, null, 2)}
                </pre>
              </details>
            </>
          )}
        </div>
      ) : null}

      {steps ? (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4">
          <h3 className="font-medium text-zinc-900">Steps (hourly ingest)</h3>
          <ul className="mt-2 space-y-1 text-sm text-zinc-700">
            <li>
              <span className="text-zinc-500">Ingest token configured: </span>
              {steps.ingest.configured ? "yes" : "no"}
            </li>
            <li>
              <span className="text-zinc-500">Hourly bucket rows in DB: </span>
              {steps.database.hourlyBucketRows}
            </li>
            <li>
              <span className="text-zinc-500">Sum of stored step counts: </span>
              {steps.database.totalStepsStored.toLocaleString()}
            </li>
          </ul>
          {steps.database.bySource.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[280px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                    <th className="py-1 pr-2">Source</th>
                    <th className="py-1 pr-2">Rows</th>
                    <th className="py-1">Steps</th>
                  </tr>
                </thead>
                <tbody>
                  {steps.database.bySource.map((r) => (
                    <tr key={r.source} className="border-b border-zinc-100">
                      <td className="py-1 pr-2 font-mono text-xs">{r.source}</td>
                      <td className="py-1 pr-2">{r.rows}</td>
                      <td className="py-1">{r.steps.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-600">
              No hourly step rows yet — confirm Shortcuts POSTs to your ingest URL (Integrations
              above).
            </p>
          )}
          {steps.ingest.fullUrlExample ? (
            <p className="mt-3 break-all text-xs text-zinc-500">
              Ingest URL: <span className="font-mono text-zinc-700">{steps.ingest.fullUrlExample}</span>
            </p>
          ) : null}
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium text-zinc-800">
              Recent buckets (newest first) + raw JSON
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-500">
                    <th className="py-1 pr-2">Bucket start (UTC)</th>
                    <th className="py-1 pr-2">Steps</th>
                    <th className="py-1 pr-2">Source</th>
                    <th className="py-1">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {steps.recentBuckets.slice(0, 10).map((r, i) => (
                    <tr key={`${r.bucketStart}-${i}`} className="border-b border-zinc-100">
                      <td className="py-1 pr-2 font-mono">{r.bucketStart}</td>
                      <td className="py-1 pr-2">{r.stepCount}</td>
                      <td className="py-1 pr-2">{r.source}</td>
                      <td className="py-1 font-mono">{r.receivedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-zinc-950 p-3 text-xs text-zinc-100">
              {JSON.stringify(steps, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
    </section>
  );
}
