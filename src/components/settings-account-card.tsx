"use client";

import { SignOutButton } from "@clerk/nextjs";
import { useState } from "react";

const DELETE_CONFIRM_PHRASE = "DELETE MY ACCOUNT";

export function SettingsAccountCard() {
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function exportData() {
    setExportBusy(true);
    setExportError(null);
    try {
      const resp = await fetch("/api/settings/export", { cache: "no-store" });
      if (!resp.ok) {
        const j = (await resp.json()) as { error?: string };
        throw new Error(j.error ?? `Export failed (${resp.status})`);
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cd = resp.headers.get("Content-Disposition");
      const match = cd?.match(/filename="([^"]+)"/);
      a.href = url;
      a.download = match?.[1] ?? "align-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  }

  async function deleteAccount() {
    if (deletePhrase !== DELETE_CONFIRM_PHRASE) return;
    if (
      !window.confirm(
        "This permanently deletes your Align data and your sign-in. You cannot undo this. Continue?",
      )
    ) {
      return;
    }
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const resp = await fetch("/api/settings/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmPhrase: DELETE_CONFIRM_PHRASE }),
      });
      const json = (await resp.json()) as { error?: string; detail?: string; ok?: boolean };
      if (!resp.ok) {
        throw new Error(json.detail ?? json.error ?? "Delete failed");
      }
      window.location.href = "/sign-in";
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <section className="w-full rounded-2xl border border-align-border/90 bg-white/90 p-5 ring-1 ring-black/[0.03]">
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-align-muted">
        Account
      </h2>

      <ul className="mt-4 divide-y divide-zinc-100 rounded-xl border border-zinc-100 bg-zinc-50/50">
        <li className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-900">Sign out</p>
            <p className="mt-0.5 text-xs text-zinc-500">End this session on this device.</p>
          </div>
          <SignOutButton redirectUrl="/">
            <button
              type="button"
              className="shrink-0 rounded-full border border-zinc-300 bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50"
            >
              Sign out
            </button>
          </SignOutButton>
        </li>

        <li className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-900">Export data</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Download JSON of your preferences, glucose, steps, workouts, food, and sleep. OAuth
              tokens are not included.
            </p>
          </div>
          <button
            type="button"
              className="inline-flex min-w-[7.75rem] shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={exportBusy}
            onClick={() => void exportData()}
          >
            {exportBusy ? "Preparing…" : "Download export"}
          </button>
        </li>
        {exportError ? (
          <p className="text-sm text-red-700" role="alert">
            {exportError}
          </p>
        ) : null}

        <li className="flex flex-col gap-3 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-900">Delete account</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Permanently removes all Align data linked to your sign-in (database cascade), then
              deletes your Clerk account. OAuth connections cannot be recovered.
            </p>
          </div>
          <label className="block text-xs font-medium text-zinc-600">
            Type{" "}
            <span className="font-mono text-zinc-800 normal-case">{DELETE_CONFIRM_PHRASE}</span> to
            enable delete
            <input
              type="text"
              autoComplete="off"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
              value={deletePhrase}
              onChange={(e) => setDeletePhrase(e.target.value)}
              placeholder={DELETE_CONFIRM_PHRASE}
              disabled={deleteBusy}
            />
          </label>
          <button
            type="button"
            className="inline-flex min-w-[7.75rem] items-center justify-center self-start rounded-full bg-red-600 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={deleteBusy || deletePhrase !== DELETE_CONFIRM_PHRASE}
            onClick={() => void deleteAccount()}
          >
            {deleteBusy ? "Deleting…" : "Delete account"}
          </button>
          {deleteError ? (
            <p className="text-sm text-red-700" role="alert">
              {deleteError}
            </p>
          ) : null}
        </li>
      </ul>
    </section>
  );
}
