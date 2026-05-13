import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { sanitizeOAuthReturnTo } from "@/lib/oauth-return-to";
import { getPublicAppBaseUrl } from "@/lib/public-app-base-url";

type DexcomStatePayload = {
  nonce: string;
  userId: string;
  issuedAt: number;
  returnTo?: string;
};

const STATE_TTL_MS = 10 * 60 * 1000;

function getStateSecret() {
  const secret = process.env.DEXCOM_STATE_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Set DEXCOM_STATE_SECRET (or AUTH_SECRET) before using Dexcom OAuth",
    );
  }
  return secret;
}

function b64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlToBuffer(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad =
    normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, "base64");
}

function sign(payloadB64: string, secret: string) {
  return b64url(createHmac("sha256", secret).update(payloadB64).digest());
}

export function createDexcomState(userId: string, returnToRaw?: string | null) {
  const returnTo = sanitizeOAuthReturnTo(returnToRaw ?? undefined);
  const payload: DexcomStatePayload = {
    nonce: b64url(randomBytes(12)),
    userId,
    issuedAt: Date.now(),
    ...(returnTo ? { returnTo } : {}),
  };

  const payloadB64 = b64url(JSON.stringify(payload));
  const signature = sign(payloadB64, getStateSecret());

  return `${payloadB64}.${signature}`;
}

export function verifyDexcomState(state: string): DexcomStatePayload {
  const [payloadB64, signature] = state.split(".");
  if (!payloadB64 || !signature) {
    throw new Error("Invalid Dexcom OAuth state format");
  }

  const expected = sign(payloadB64, getStateSecret());
  const valid = timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) {
    throw new Error("Invalid Dexcom OAuth state signature");
  }

  const payload = JSON.parse(
    b64urlToBuffer(payloadB64).toString("utf8"),
  ) as DexcomStatePayload;
  if (!payload.userId || !payload.issuedAt) {
    throw new Error("Invalid Dexcom OAuth state payload");
  }

  if (Date.now() - payload.issuedAt > STATE_TTL_MS) {
    throw new Error("Expired Dexcom OAuth state");
  }

  return payload;
}

export function getDexcomAuthorizeUrl() {
  return (
    process.env.DEXCOM_AUTHORIZE_URL ?? "https://api.dexcom.com/v3/oauth2/login"
  );
}

export function getDexcomTokenUrl() {
  return (
    process.env.DEXCOM_TOKEN_URL ?? "https://api.dexcom.com/v3/oauth2/token"
  );
}

/** Normalize redirect URI so it matches Dexcom app registration (no trailing slash on path, no hash). */
function normalizeDexcomRedirectUri(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  try {
    const u = new URL(trimmed);
    u.hash = "";
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.replace(/\/+$/, "");
    }
    return u.toString();
  } catch {
    return trimmed;
  }
}

export function getDexcomRedirectUri() {
  const explicit = process.env.DEXCOM_REDIRECT_URI?.trim();
  const built = `${getPublicAppBaseUrl().replace(/\/$/, "")}/api/integrations/dexcom/callback`;
  return normalizeDexcomRedirectUri(explicit || built);
}

/**
 * Dexcom authorization only accepts `offline_access` for the authorize/login step.
 * Extra scopes in env (e.g. legacy examples) cause "Invalid query params" / invalid_request on Dexcom's auth UI.
 */
export function getDexcomOAuthAuthorizeScope(): string {
  return "offline_access";
}
