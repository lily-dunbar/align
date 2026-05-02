import "server-only";

import * as https from "node:https";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { glucoseReadings } from "@/db/schema";

/** Same application id as Dexcom Share / pydexcom. */
const SHARE_APPLICATION_ID = "d8665ade-9673-4e27-9ff6-92db4ce13d13";

/** Dexcom Share trend codes (1-based) → label (matches pydexcom). */
const TREND_NAMES = [
  "DoubleUp",
  "SingleUp",
  "FortyFiveUp",
  "Flat",
  "FortyFiveDown",
  "SingleDown",
  "DoubleDown",
] as const;

type ShareRegion = "us" | "eu";

function shareHost(region: ShareRegion): string {
  return region === "eu" ? "shareous1.dexcom.com" : "share2.dexcom.com";
}

function sharePath(resource: string): string {
  return `/ShareWebServices/Services/${resource}`;
}

/** HTTPS POST via `node:https` — avoids `fetch` (can be monkey-patched by old polyfills in dev). */
function sharePostJson(host: string, resource: string, body: unknown): Promise<unknown> {
  const path = sharePath(resource);
  const bodyStr = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: host,
        port: 443,
        method: "POST",
        path,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Content-Length": Buffer.byteLength(bodyStr, "utf8"),
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
          if (status < 200 || status >= 300) {
            const detail =
              typeof data === "string" ? data : JSON.stringify(data).slice(0, 500);
            reject(
              new Error(`Dexcom Share ${resource} failed: HTTP ${status} ${detail}`),
            );
            return;
          }
          resolve(data);
        });
      },
    );

    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

/** Dexcom Share / PyDexcom-style env (server-wide; single CGM account → whoever runs Sync). */
export function isPydexcomShareConfigured(): boolean {
  const u = process.env.PYDEXCOM_USERNAME?.trim();
  const p = process.env.PYDEXCOM_PASSWORD;
  const r = process.env.PYDEXCOM_REGION?.trim().toLowerCase();
  return Boolean(u && p && (r === "us" || r === "eu"));
}

function getShareRegion(): ShareRegion {
  return process.env.PYDEXCOM_REGION?.trim().toLowerCase() === "eu" ? "eu" : "us";
}

async function getPublisherAccountId(
  host: string,
  username: string,
  password: string,
): Promise<string> {
  const data = await sharePostJson(host, "General/AuthenticatePublisherAccount", {
    applicationId: SHARE_APPLICATION_ID,
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

async function getSessionId(host: string, accountId: string, password: string): Promise<string> {
  const data = await sharePostJson(host, "General/LoginPublisherAccountById", {
    applicationId: SHARE_APPLICATION_ID,
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

function extractWtMillis(wt: unknown): number | null {
  const s = typeof wt === "string" ? wt : wt != null ? String(wt) : "";
  const match = s.match(/\d+/g);
  if (!match?.[0]) return null;
  const n = parseInt(match[0], 10);
  const t = new Date(n).getTime();
  return Number.isFinite(t) ? t : null;
}

function parseTrend(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "number" && raw >= 1 && raw <= TREND_NAMES.length) {
    return TREND_NAMES[raw - 1]?.toLowerCase() ?? null;
  }
  if (typeof raw === "string") return raw.toLowerCase();
  return null;
}

function parseShareGlucoseRow(entry: unknown): {
  mgdl: number;
  timestamp: number;
  trend: string | null;
} | null {
  if (!entry || typeof entry !== "object") return null;
  const row = entry as Record<string, unknown>;

  const value = row.Value ?? row.value;
  const mgdlNum =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(mgdlNum)) return null;

  const ts = extractWtMillis(row.WT ?? row.wt);
  if (ts === null) return null;

  const trend = parseTrend(row.Trend ?? row.trend);

  return {
    mgdl: Math.round(mgdlNum),
    timestamp: ts,
    trend,
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
    timestamp: number;
    trend: string | null;
  }>
> {
  const data = await sharePostJson(host, "Publisher/ReadPublisherLatestGlucoseValues", {
    sessionId,
    minutes,
    maxCount,
  });

  if (!Array.isArray(data)) {
    throw new Error("Dexcom Share: expected glucose array");
  }

  const out: Array<{ mgdl: number; timestamp: number; trend: string | null }> = [];
  for (const row of data) {
    const parsed = parseShareGlucoseRow(row);
    if (parsed) out.push(parsed);
  }
  return out;
}

async function fetchShareGlucoseEntries(
  username: string,
  password: string,
  region: ShareRegion,
  minutes: number,
  maxCount: number,
) {
  const host = shareHost(region);
  const accountId = await getPublisherAccountId(host, username, password);
  const sessionId = await getSessionId(host, accountId, password);
  return readPublisherLatestGlucoseValues(host, sessionId, minutes, maxCount);
}

function formatIsoNoMillis(date: Date) {
  return date.toISOString().slice(0, 19);
}

export async function syncDexcomGlucoseReadingsFromShare(userId: string) {
  const username = process.env.PYDEXCOM_USERNAME?.trim() ?? "";
  const password = process.env.PYDEXCOM_PASSWORD ?? "";
  const region = getShareRegion();

  const newest = await db.query.glucoseReadings.findFirst({
    where: eq(glucoseReadings.userId, userId),
    orderBy: [desc(glucoseReadings.observedAt)],
    columns: { observedAt: true },
  });

  const now = Date.now();
  const defaultLookbackDays = 1;
  const firstSyncLookbackDays = 90;

  const minutesLookback = newest
    ? defaultLookbackDays * 24 * 60
    : firstSyncLookbackDays * 24 * 60;

  const maxCount = newest ? 800 : 30_000;

  const entries = await fetchShareGlucoseEntries(
    username,
    password,
    region,
    minutesLookback,
    maxCount,
  );

  let inserted = 0;
  let updated = 0;

  for (const entry of entries) {
    const observedAt = new Date(entry.timestamp);
    const mgdl = entry.mgdl;
    const trend = entry.trend;

    const existing = await db.query.glucoseReadings.findFirst({
      where: and(
        eq(glucoseReadings.userId, userId),
        eq(glucoseReadings.observedAt, observedAt),
      ),
      columns: { id: true },
    });

    if (existing) {
      await db
        .update(glucoseReadings)
        .set({
          mgdl,
          trend,
          trendRate: null,
          updatedAt: new Date(),
        })
        .where(eq(glucoseReadings.id, existing.id));
      updated += 1;
    } else {
      await db.insert(glucoseReadings).values({
        userId,
        observedAt,
        mgdl,
        trend,
        trendRate: null,
        source: "dexcom",
      });
      inserted += 1;
    }
  }

  return {
    fetched: entries.length,
    inserted,
    updated,
    startDate: formatIsoNoMillis(new Date(now - minutesLookback * 60 * 1000)),
    endDate: formatIsoNoMillis(new Date(now)),
    firstSync: !newest,
    authMode: "share" as const,
  };
}
