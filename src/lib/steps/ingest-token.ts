import { createHmac, timingSafeEqual } from "node:crypto";

type StepsTokenPayload = {
  userId: string;
  v: 1;
};

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

function getStepsTokenSecret() {
  const secret =
    process.env.STEPS_TOKEN_SECRET ??
    process.env.STEPS_INGEST_SECRET ??
    process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Set STEPS_TOKEN_SECRET (or STEPS_INGEST_SECRET / AUTH_SECRET) to use step ingest tokens",
    );
  }
  return secret;
}

function sign(payloadB64: string, secret: string) {
  return b64url(createHmac("sha256", secret).update(payloadB64).digest());
}

export function createStepIngestToken(userId: string) {
  const payload: StepsTokenPayload = { userId, v: 1 };
  const payloadB64 = b64url(JSON.stringify(payload));
  const signature = sign(payloadB64, getStepsTokenSecret());
  return `${payloadB64}.${signature}`;
}

export function verifyStepIngestToken(token: string): StepsTokenPayload {
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) {
    throw new Error("Invalid step ingest token format");
  }

  const expected = sign(payloadB64, getStepsTokenSecret());
  const valid = timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) {
    throw new Error("Invalid step ingest token signature");
  }

  const payload = JSON.parse(
    b64urlToBuffer(payloadB64).toString("utf8"),
  ) as StepsTokenPayload;
  if (!payload.userId || payload.v !== 1) {
    throw new Error("Invalid step ingest token payload");
  }

  return payload;
}
