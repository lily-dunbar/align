import type { NextRequest } from "next/server";

/** Same resolution order as signed token helpers — keep Shortcut header + env aligned. */
export function getStepsIngestSharedSecret(): string | null {
  const s =
    process.env.STEPS_INGEST_SECRET?.trim() ||
    process.env.STEPS_TOKEN_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim();
  return s || null;
}

export function isStepsIngestAuthorized(req: NextRequest): boolean {
  const required = getStepsIngestSharedSecret();
  if (!required) return false;
  const authHeader = req.headers.get("authorization");
  const shortcutHeader = req.headers.get("x-shortcut-secret");
  const bearer =
    authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  return bearer === required || shortcutHeader === required;
}
