"use client";

import { useRef, useState } from "react";

import {
  PATTERN_THRESHOLD_DEFAULT,
  PATTERN_THRESHOLD_MAX,
  PATTERN_THRESHOLD_MIN,
} from "@/lib/pattern-threshold-constants";

type Props = {
  initialPercent: number;
  /** When true, render as a subsection (e.g. inside Settings targets) without the outer card chrome. */
  embedded?: boolean;
  onThresholdSaved?: (percent: number) => void;
};

export function PatternThresholdSlider({
  initialPercent,
  embedded = false,
  onThresholdSaved,
}: Props) {
  const [value, setValue] = useState(initialPercent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSaved = useRef(initialPercent);

  async function save(next: number) {
    if (next === lastSaved.current) return;
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch("/api/settings/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patternThresholdPercent: next }),
      });
      const json = (await resp.json()) as {
        preferences?: { patternThresholdPercent: number };
        error?: string;
      };
      if (!resp.ok || json.preferences == null) {
        throw new Error(json.error ?? "Could not save threshold");
      }
      lastSaved.current = json.preferences.patternThresholdPercent;
      setValue(json.preferences.patternThresholdPercent);
      onThresholdSaved?.(json.preferences.patternThresholdPercent);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setValue(lastSaved.current);
    } finally {
      setSaving(false);
    }
  }

  function commit() {
    void save(value);
  }

  const wrap = embedded
    ? "pt-0"
    : "rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm";
  const titleClass = embedded
    ? "text-xs font-semibold uppercase tracking-wide text-zinc-500"
    : "text-lg font-semibold tracking-tight text-zinc-900";
  const TitleTag = embedded ? "h3" : "h2";

  return (
    <div className={wrap}>
      <TitleTag className={titleClass}>Pattern threshold</TitleTag>
      <p className="mt-1 text-sm text-zinc-600">
        Minimum confidence score to show a pattern. Lower shows more rows; higher requires stronger
        evidence in the data (default {PATTERN_THRESHOLD_DEFAULT}%).
      </p>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="font-medium text-zinc-900">{value}%</span>
          {saving ? (
            <span className="text-xs text-zinc-400" aria-live="polite">
              Saving…
            </span>
          ) : null}
        </div>
        <input
          type="range"
          className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-200 accent-emerald-600 disabled:opacity-50"
          min={PATTERN_THRESHOLD_MIN}
          max={PATTERN_THRESHOLD_MAX}
          step={1}
          value={value}
          disabled={saving}
          aria-valuemin={PATTERN_THRESHOLD_MIN}
          aria-valuemax={PATTERN_THRESHOLD_MAX}
          aria-valuenow={value}
          aria-label="Minimum pattern confidence percent"
          onChange={(e) => setValue(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={(e) => {
            if (e.key === "Enter" || e.key === " ") commit();
          }}
        />
        <div className="mt-1 flex justify-between text-[11px] text-zinc-400">
          <span>{PATTERN_THRESHOLD_MIN}%</span>
          <span>{PATTERN_THRESHOLD_MAX}%</span>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
