import type { NextRequest } from "next/server";

/**
 * Legacy / internal: first non-empty of STEPS_INGEST_SECRET, STEPS_TOKEN_SECRET, AUTH_SECRET.
 * Used by deprecated POST /api/ingest/steps (no token path) only.
 */
export function getStepsIngestSharedSecret(): string | null {
  const s =
    process.env.STEPS_INGEST_SECRET?.trim() ||
    process.env.STEPS_TOKEN_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim();
  return s || null;
}

/**
 * Optional header auth for POST /api/ingest/steps/:token.
 * Only `STEPS_INGEST_SECRET` is used — if unset, the opaque URL token alone authorizes the request.
 * (AUTH_SECRET is not required for Shortcuts; set STEPS_INGEST_SECRET only if you want X-Shortcut-Secret.)
 */
export function getStepsShortcutHeaderSecret(): string | null {
  const s = process.env.STEPS_INGEST_SECRET?.trim();
  return s || null;
}

function readShortcutSecretHeader(req: NextRequest): string | null {
  const candidates = [
    "x-shortcut-secret",
    "x_shortcut_secret",
    "x-shortcut_secret",
    "x_shortcut-secret",
  ];
  for (const name of candidates) {
    const v = req.headers.get(name)?.trim();
    if (v) return v;
  }
  return null;
}

export function isStepsIngestAuthorized(req: NextRequest): boolean {
  const required = getStepsShortcutHeaderSecret();
  if (!required) return true;

  const authHeader = req.headers.get("authorization");
  const shortcutHeader = readShortcutSecretHeader(req);
  const bearer =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;
  const fromShortcut = shortcutHeader ?? "";
  return (
    (bearer !== null && bearer === required) ||
    (fromShortcut !== "" && fromShortcut === required)
  );
}
