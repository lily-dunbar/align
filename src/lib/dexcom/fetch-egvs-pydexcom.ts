import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

export type PyDexcomEgv = {
  systemTime: string;
  value: number;
  unit?: string;
  trend?: string | null;
};

export type PyDexcomResult =
  | { ok: true; egvs: PyDexcomEgv[] }
  | { ok: false; error: string };

/**
 * Runs `scripts/fetch_dexcom_pydexcom.py` with the same `process.env` as Next
 * (must include PYDEXCOM_*). Uses `PYTHON_BIN` if set, else `python3`.
 */
export async function fetchDexcomEgvsViaPyDexcom(minutes: number): Promise<PyDexcomResult> {
  const pythonBin = process.env.PYTHON_BIN?.trim() || "python3";
  const scriptPath = join(process.cwd(), "scripts", "fetch_dexcom_pydexcom.py");
  const m = Math.max(1, Math.min(Math.floor(minutes), 90 * 24 * 60));

  try {
    const { stdout, stderr } = await execFileAsync(
      pythonBin,
      [scriptPath, "--minutes", String(m)],
      {
        env: process.env,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120_000,
      },
    );

    const text = (stdout ?? "").trim();
    if (!text) {
      return {
        ok: false,
        error: stderr?.trim() || "pydexcom script produced no stdout",
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return { ok: false, error: `Invalid JSON from pydexcom script: ${text.slice(0, 200)}` };
    }

    if (!parsed || typeof parsed !== "object") {
      return { ok: false, error: "Unexpected pydexcom script response" };
    }

    const rec = parsed as Record<string, unknown>;
    if (rec.ok === true && Array.isArray(rec.egvs)) {
      const egvs: PyDexcomEgv[] = [];
      for (const row of rec.egvs) {
        if (!row || typeof row !== "object") continue;
        const o = row as Record<string, unknown>;
        const systemTime = typeof o.systemTime === "string" ? o.systemTime : null;
        const value = typeof o.value === "number" ? o.value : Number(o.value);
        if (!systemTime || !Number.isFinite(value)) continue;
        egvs.push({
          systemTime,
          value: Math.round(value),
          unit: typeof o.unit === "string" ? o.unit : undefined,
          trend: typeof o.trend === "string" ? o.trend : o.trend == null ? null : String(o.trend),
        });
      }
      return { ok: true, egvs };
    }

    if (rec.ok === false && typeof rec.error === "string") {
      return { ok: false, error: rec.error };
    }

    return { ok: false, error: "Unexpected pydexcom script response shape" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
