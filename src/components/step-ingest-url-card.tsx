"use client";

import { useState } from "react";

type Props = {
  initialIngestUrl: string;
  tokenEndpoint: string;
};

export function StepIngestUrlCard({ initialIngestUrl, tokenEndpoint }: Props) {
  const [ingestUrl, setIngestUrl] = useState(initialIngestUrl);
  const [copyState, setCopyState] = useState<
    "idle" | "url_done" | "header_done" | "error"
  >("idle");
  const [isRotating, setIsRotating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(ingestUrl);
      setCopyState("url_done");
      setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      setCopyState("error");
    }
  }

  async function copyHeaderKey() {
    try {
      await navigator.clipboard.writeText("X-Shortcut-Secret");
      setCopyState("header_done");
      setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      setCopyState("error");
    }
  }

  async function rotateToken() {
    setIsRotating(true);
    setError(null);
    try {
      const resp = await fetch(tokenEndpoint, { method: "POST", credentials: "include" });
      const json = (await resp.json()) as { ingestUrl?: string; error?: string };
      if (!resp.ok || !json.ingestUrl) {
        setError(json.error ?? "Failed to rotate token");
        return;
      }
      setIngestUrl(json.ingestUrl);
      setCopyState("idle");
    } catch {
      setError("Failed to rotate token");
    } finally {
      setIsRotating(false);
    }
  }

  return (
    <section className="w-full rounded-lg border p-4 text-left">
      <h2 className="text-lg font-medium">Apple Steps Ingest URL</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Add these in Apple Shortcuts &rarr; Get Contents of URL:
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-zinc-700">
        <li>URL = the ingest URL below</li>
        <li>
          Header key ={" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5">X-Shortcut-Secret</code>
        </li>
        <li>Header value = your app&apos;s `STEPS_INGEST_SECRET` value</li>
      </ol>
      <div className="mt-3 rounded bg-zinc-50 p-3 text-xs break-all">{ingestUrl}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyUrl}
          className="rounded border px-3 py-1.5 text-sm"
        >
          {copyState === "url_done" ? "Copied URL" : "Copy Ingest URL"}
        </button>
        <button
          type="button"
          onClick={copyHeaderKey}
          className="rounded border px-3 py-1.5 text-sm"
        >
          {copyState === "header_done"
            ? "Copied Header Key"
            : "Copy Ingest Header Key"}
        </button>
        <button
          type="button"
          onClick={rotateToken}
          disabled={isRotating}
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-60"
        >
          {isRotating ? "Regenerating..." : "Regenerate token"}
        </button>
      </div>
      {copyState === "error" ? (
        <p className="mt-2 text-xs text-red-600">Clipboard copy failed. Copy manually.</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </section>
  );
}
