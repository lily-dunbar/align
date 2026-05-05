import "server-only";

import * as https from "node:https";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { glucoseReadings } from "@/db/schema";
import { fetchDexcomEgvsViaPyDexcom } from "@/lib/dexcom/fetch-egvs-pydexcom";

/**
 * Matches `pydexcom.const` — Share app id differs by region (US/OUS vs Japan).
 * @see https://github.com/gagebenne/pydexcom/blob/main/pydexcom/const.py
 */
const APPLICATION_ID_US_OUS = "d89443d2-327c-4a6f-89e5-496bbb0317db";
const APPLICATION_ID_JP = "d8665ade-9673-4e27-9ff6-92db4ce13d13";

/** Same keys as `pydexcom.Region`: us | ous | jp */
const DEXCOM_TREND_DIRECTIONS: Record<string, number> = {
  None: 0,
  DoubleUp: 1,
  SingleUp: 2,
  FortyFiveUp: 3,
  Flat: 4,
  FortyFiveDown: 5,
  SingleDown: 6,
  DoubleDown: 7,
  NotComputable: 8,
  RateOutOfRange: 9,
};

const TREND_DESCRIPTIONS = [
  "",
  "rising quickly",
  "rising",
  "rising slightly",
  "steady",
  "falling slightly",
  "falling",
  "falling quickly",
  "unable to determine trend",
  "trend unavailable",
] as const;

/** pydexcom caps per request (`MAX_MINUTES`, `MAX_MAX_COUNT`). */
const MAX_MINUTES = 1440;
const MAX_MAX_COUNT = 288;

type PydexRegion = "us" | "ous" | "jp";

function normalizeRegion(raw: string | undefined): PydexRegion | null {
  const r = raw?.trim().toLowerCase();
  if (r === "us") return "us";
  if (r === "ous" || r === "eu") return "ous";
  if (r === "jp") return "jp";
  return null;
}

function shareHost(region: PydexRegion): string {
  switch (region) {
    case "us":
      return "share2.dexcom.com";
    case "ous":
      return "shareous1.dexcom.com";
    case "jp":
      return "share.dexcom.jp";
  }
}

function applicationId(region: PydexRegion): string {
  return region === "jp" ? APPLICATION_ID_JP : APPLICATION_ID_US_OUS;
}

function sharePath(resource: string): string {
  return `/ShareWebServices/Services/${resource}`;
}

function httpsJson(
  host: string,
  pathWithQuery: string,
  body: string,
  headers: Record<string, string>,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: host,
        port: 443,
        method: "POST",
        path: pathWithQuery,
        headers: {
          ...headers,
          "Content-Length": Buffer.byteLength(body, "utf8"),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let data: unknown;
          try {
            data = text ? JSON.parse(text) : null;
          } catch {
            data = text;
          }
          const status = res.statusCode ?? 0;

          if (data && typeof data === "object" && !Array.isArray(data) && "Code" in data) {
            const code = (data as { Code?: unknown }).Code;
            const message = (data as { Message?: unknown }).Message;
            reject(
              new Error(
                `Dexcom Share error: ${String(code)} ${message != null ? String(message) : ""}`.trim(),
              ),
            );
            return;
          }

          if (status < 200 || status >= 300) {
            const detail =
              typeof data === "string" ? data : JSON.stringify(data).slice(0, 500);
            reject(new Error(`Dexcom Share failed: HTTP ${status} ${detail}`));
            return;
          }
          resolve(data);
        });
      },
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/** JSON body POST (Authenticate / Login) — matches pydexcom `_post` with `json`. */
function sharePostJsonBody(host: string, resource: string, jsonBody: unknown): Promise<unknown> {
  const bodyStr = JSON.stringify(jsonBody ?? {});
  return httpsJson(
    host,
    sharePath(resource),
    bodyStr,
    {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  );
}

/**
 * Glucose endpoint: pydexcom sends `sessionId`, `minutes`, `maxCount` as **query params**
 * and POST body `{}` (see `Dexcom._glucose_readings_endpoint_arguments`).
 */
function sharePostGlucoseReadingsQuery(
  host: string,
  sessionId: string,
  minutes: number,
  maxCount: number,
): Promise<unknown> {
  const q = new URLSearchParams({
    sessionId,
    minutes: String(Math.min(Math.max(0, minutes), MAX_MINUTES)),
    maxCount: String(Math.min(Math.max(0, maxCount), MAX_MAX_COUNT)),
  });
  const pathWithQuery = `${sharePath("Publisher/ReadPublisherLatestGlucoseValues")}?${q.toString()}`;
  return httpsJson(host, pathWithQuery, "{}", {
    "Content-Type": "application/json",
    Accept: "application/json",
  });
}

/** Alternate shape used by some Share clients (JSON body, no query string). */
function sharePostGlucoseReadingsBody(
  host: string,
  sessionId: string,
  minutes: number,
  maxCount: number,
): Promise<unknown> {
  return sharePostJsonBody(host, "Publisher/ReadPublisherLatestGlucoseValues", {
    sessionId,
    minutes: Math.min(Math.max(0, minutes), MAX_MINUTES),
    maxCount: Math.min(Math.max(0, maxCount), MAX_MAX_COUNT),
  });
}

/** Dexcom Share / pydexcom-style env (server-wide; publisher credentials, not follower). */
export function isPydexcomShareConfigured(): boolean {
  const u = process.env.PYDEXCOM_USERNAME?.trim();
  const p = process.env.PYDEXCOM_PASSWORD;
  const r = normalizeRegion(process.env.PYDEXCOM_REGION);
  return Boolean(u && p && r);
}

function getShareRegion(): PydexRegion {
  return normalizeRegion(process.env.PYDEXCOM_REGION) ?? "us";
}

async function getPublisherAccountId(
  host: string,
  appId: string,
  username: string,
  password: string,
): Promise<string> {
  const data = await sharePostJsonBody(host, "General/AuthenticatePublisherAccount", {
    applicationId: appId,
    accountName: username,
    password,
  });

  if (typeof data === "string") return data;
  if (data && typeof data === "object" && "accountId" in data) {
    const id = (data as { accountId?: unknown }).accountId;
    if (typeof id === "string") return id;
  }
  throw new Error("Dexcom Share: unexpected account response shape");
}

async function getSessionId(
  host: string,
  appId: string,
  accountId: string,
  password: string,
): Promise<string> {
  const data = await sharePostJsonBody(host, "General/LoginPublisherAccountById", {
    applicationId: appId,
    accountId,
    password,
  });

  if (typeof data === "string") return data;
  if (data && typeof data === "object" && "sessionId" in data) {
    const sid = (data as { sessionId?: unknown }).sessionId;
    if (typeof sid === "string") return sid;
  }
  throw new Error("Dexcom Share: unexpected session response shape");
}

/** Epoch ms from .NET `/Date(n)/` or `/Date(n+0000)/` (pydexcom uses ms ÷ 1000 for Python). */
function parseDotNetDateMs(raw: string): number | null {
  const m = raw.match(/Date\((\d+)([+-]\d{4})?\)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n)) return null;
  if (n < 1e12) return n * 1000;
  return n;
}

/** pydexcom `GlucoseReading`: `DT` first, then `ST`, then `WT` / numeric epoch. */
function parseObservedAt(row: Record<string, unknown>): Date | null {
  for (const key of ["DT", "dt", "ST", "st"] as const) {
    const v = row[key];
    if (typeof v !== "string" || !v.trim()) continue;
    const trimmed = v.trim();
    const ms = parseDotNetDateMs(trimmed);
    if (ms != null) {
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d;
    }
    const isoTry = Date.parse(trimmed);
    if (!Number.isNaN(isoTry)) return new Date(isoTry);
  }
  const wt = row.WT ?? row.wt;
  const s = typeof wt === "string" ? wt : wt != null ? String(wt) : "";
  const match = s.match(/\d+/g);
  if (!match?.[0]) return null;
  const n = parseInt(match[0], 10);
  const ms = n < 1e12 ? n * 1000 : n;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

function trendDescription(row: Record<string, unknown>): string | null {
  const raw = row.Trend ?? row.trend;
  if (raw == null) return null;

  let idx: number | null = null;
  if (typeof raw === "string") {
    const asNum = Number(raw);
    if (Number.isInteger(asNum) && asNum >= 0 && asNum < TREND_DESCRIPTIONS.length) {
      idx = asNum;
    } else {
      idx = DEXCOM_TREND_DIRECTIONS[raw] ?? null;
    }
  } else if (typeof raw === "number" && raw >= 0 && raw < TREND_DESCRIPTIONS.length) {
    idx = raw;
  }
  if (idx == null || idx < 0 || idx >= TREND_DESCRIPTIONS.length) return null;
  const desc = TREND_DESCRIPTIONS[idx];
  return desc || null;
}

function parseShareGlucoseRow(entry: unknown): {
  mgdl: number;
  observedAt: Date;
  trend: string | null;
} | null {
  if (!entry || typeof entry !== "object") return null;
  const row = entry as Record<string, unknown>;

  const value = row.Value ?? row.value;
  const mgdlNum =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(mgdlNum)) return null;

  const observedAt = parseObservedAt(row);
  if (!observedAt) return null;

  return {
    mgdl: Math.round(mgdlNum),
    observedAt,
    trend: trendDescription(row),
  };
}

async function readPublisherLatestGlucoseValues(
  host: string,
  sessionId: string,
  minutes: number,
  maxCount: number,
): Promise<
  Array<{
    mgdl: number;
    observedAt: Date;
    trend: string | null;
  }>
> {
  let data: unknown = await sharePostGlucoseReadingsQuery(host, sessionId, minutes, maxCount);
  if (!Array.isArray(data) || data.length === 0) {
    data = await sharePostGlucoseReadingsBody(host, sessionId, minutes, maxCount);
  }

  if (!Array.isArray(data)) {
    throw new Error("Dexcom Share: expected glucose array");
  }

  const out: Array<{ mgdl: number; observedAt: Date; trend: string | null }> = [];
  for (const row of data) {
    const parsed = parseShareGlucoseRow(row);
    if (parsed) out.push(parsed);
  }
  return out;
}

async function fetchShareGlucoseEntries(
  username: string,
  password: string,
  region: PydexRegion,
  minutes: number,
  maxCount: number,
) {
  const host = shareHost(region);
  const appId = applicationId(region);
  const accountId = await getPublisherAccountId(host, appId, username, password);
  const sessionId = await getSessionId(host, appId, accountId, password);
  return readPublisherLatestGlucoseValues(host, sessionId, minutes, maxCount);
}

function formatIsoNoMillis(date: Date) {
  return date.toISOString().slice(0, 19);
}

export type ShareSyncOptions = {
  /**
   * Clamped to 1–90.
   * Share: drives pydexcom `--minutes` (capped again inside pydexcom / script).
   * OAuth: EGV window is `now - lookbackDays` (default 30 when omitted and readings already exist).
   */
  lookbackDays?: number;
};

async function persistShareGlucoseEntries(
  userId: string,
  entries: ReadonlyArray<{ observedAt: Date; mgdl: number; trend: string | null }>,
): Promise<{ inserted: number; updated: number; unchanged: number; fetched: number }> {
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const entry of entries) {
    const observedAt = entry.observedAt;
    if (Number.isNaN(observedAt.getTime())) continue;

    const existing = await db.query.glucoseReadings.findFirst({
      where: and(
        eq(glucoseReadings.userId, userId),
        eq(glucoseReadings.observedAt, observedAt),
      ),
      columns: { id: true, mgdl: true, trend: true, trendRate: true },
    });

    if (existing) {
      const same =
        existing.mgdl === entry.mgdl &&
        (existing.trend ?? null) === (entry.trend ?? null) &&
        (existing.trendRate ?? null) === null;
      if (same) {
        unchanged += 1;
        continue;
      }
      await db
        .update(glucoseReadings)
        .set({
          mgdl: entry.mgdl,
          trend: entry.trend,
          trendRate: null,
          updatedAt: new Date(),
        })
        .where(eq(glucoseReadings.id, existing.id));
      updated += 1;
    } else {
      await db.insert(glucoseReadings).values({
        userId,
        observedAt,
        mgdl: entry.mgdl,
        trend: entry.trend,
        trendRate: null,
        source: "dexcom",
      });
      inserted += 1;
    }
  }

  return { inserted, updated, unchanged, fetched: entries.length };
}

/**
 * Dexcom Share: prefers **pydexcom** via `scripts/fetch_dexcom_pydexcom.py` when it returns data;
 * otherwise falls back to the in-process HTTPS Share client.
 *
 * Prerequisites: Share ON, at least one follower, **publisher** PYDEXCOM_* credentials.
 */
export async function syncDexcomGlucoseReadingsFromShare(
  userId: string,
  opts?: ShareSyncOptions,
) {
  const username = process.env.PYDEXCOM_USERNAME?.trim() ?? "";
  const password = process.env.PYDEXCOM_PASSWORD ?? "";
  const region = getShareRegion();

  const newest = await db.query.glucoseReadings.findFirst({
    where: eq(glucoseReadings.userId, userId),
    orderBy: [desc(glucoseReadings.observedAt)],
    columns: { observedAt: true },
  });

  const now = Date.now();
  const lookbackDays = Math.min(90, Math.max(1, Math.floor(opts?.lookbackDays ?? 30)));
  const minutesRequested = lookbackDays * 24 * 60;

  const py = await fetchDexcomEgvsViaPyDexcom(minutesRequested);
  if (py.ok && py.egvs.length > 0) {
    const entries = py.egvs
      .map((e) => {
        const observedAt = new Date(e.systemTime);
        return {
          observedAt,
          mgdl: e.value,
          trend: e.trend ?? null,
        };
      })
      .filter((e) => !Number.isNaN(e.observedAt.getTime()));

    const { inserted, updated, unchanged, fetched } = await persistShareGlucoseEntries(
      userId,
      entries,
    );
    return {
      fetched,
      inserted,
      updated,
      unchanged,
      startDate: formatIsoNoMillis(new Date(now - minutesRequested * 60 * 1000)),
      endDate: formatIsoNoMillis(new Date(now)),
      firstSync: !newest,
      authMode: "share" as const,
      syncMethod: "pydexcom-python" as const,
    };
  }

  const minutesLookback = MAX_MINUTES;
  const maxCount = MAX_MAX_COUNT;

  const entries = await fetchShareGlucoseEntries(
    username,
    password,
    region,
    minutesLookback,
    maxCount,
  );

  const { inserted, updated, unchanged, fetched } = await persistShareGlucoseEntries(
    userId,
    entries,
  );

  return {
    fetched,
    inserted,
    updated,
    unchanged,
    startDate: formatIsoNoMillis(new Date(now - minutesLookback * 60 * 1000)),
    endDate: formatIsoNoMillis(new Date(now)),
    firstSync: !newest,
    authMode: "share" as const,
    syncMethod: "share-https" as const,
  };
}
