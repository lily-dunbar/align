import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

type StravaStatePayload = {
  nonce: string;
  userId: string;
  issuedAt: number;
};

const STATE_TTL_MS = 10 * 60 * 1000;

function getStateSecret() {
  const secret = process.env.STRAVA_STATE_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Set STRAVA_STATE_SECRET (or AUTH_SECRET) before using Strava OAuth",
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

export function createStravaState(userId: string) {
  const payload: StravaStatePayload = {
    nonce: b64url(randomBytes(12)),
    userId,
    issuedAt: Date.now(),
  };

  const payloadB64 = b64url(JSON.stringify(payload));
  const signature = sign(payloadB64, getStateSecret());

  return `${payloadB64}.${signature}`;
}

export function verifyStravaState(state: string): StravaStatePayload {
  const [payloadB64, signature] = state.split(".");
  if (!payloadB64 || !signature) {
    throw new Error("Invalid Strava OAuth state format");
  }

  const expected = sign(payloadB64, getStateSecret());
  const valid = timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) {
    throw new Error("Invalid Strava OAuth state signature");
  }

  const payload = JSON.parse(
    b64urlToBuffer(payloadB64).toString("utf8"),
  ) as StravaStatePayload;

  if (!payload.userId || !payload.issuedAt) {
    throw new Error("Invalid Strava OAuth state payload");
  }

  if (Date.now() - payload.issuedAt > STATE_TTL_MS) {
    throw new Error("Expired Strava OAuth state");
  }

  return payload;
}

export function getStravaAuthorizeUrl() {
  return process.env.STRAVA_AUTHORIZE_URL ?? "https://www.strava.com/oauth/authorize";
}

export function getStravaTokenUrl() {
  return process.env.STRAVA_TOKEN_URL ?? "https://www.strava.com/oauth/token";
}

export function getStravaApiBaseUrl() {
  return process.env.STRAVA_API_BASE_URL ?? "https://www.strava.com/api/v3";
}

export function getStravaRedirectUri() {
  const explicit = process.env.STRAVA_REDIRECT_URI;
  if (explicit) return explicit;

  const base = process.env.AUTH_URL;
  if (!base) {
    throw new Error(
      "Set AUTH_URL (or STRAVA_REDIRECT_URI) before using Strava OAuth",
    );
  }

  return `${base.replace(/\/$/, "")}/api/integrations/strava/callback`;
}
