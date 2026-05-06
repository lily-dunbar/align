/**
 * Canonical public origin (no trailing slash) for OAuth redirects and absolute
 * URLs such as the steps ingest endpoint shown in Settings.
 *
 * Prefer `AUTH_URL` (set explicitly in production — especially when using a custom
 * domain so it matches Dexcom/Strava redirect URIs).
 *
 * On Vercel, when `AUTH_URL` is unset, prefer `VERCEL_PROJECT_PRODUCTION_URL` (stable
 * production hostname on every deployment, including previews) before `VERCEL_URL`.
 * That way Apple Steps “Copy URL” always targets production even if you opened
 * Settings on a preview deploy — otherwise Shortcuts keeps posting to stale preview
 * URLs after new pushes.
 *
 * Requires “System environment variables” enabled for the project in Vercel; if unset,
 * we fall back to `VERCEL_URL` (per-deployment).
 */
export function getPublicAppBaseUrl(): string {
  const explicit = process.env.AUTH_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const normalizeHost = (raw: string) =>
    raw.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionHost) {
    return `https://${normalizeHost(productionHost)}`;
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return `https://${normalizeHost(vercel)}`;
  }

  return "http://localhost:4000";
}
