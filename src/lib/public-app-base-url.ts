/**
 * Canonical public origin (no trailing slash) for OAuth redirects and absolute
 * URLs such as the steps ingest endpoint shown in Settings.
 *
 * Prefer `AUTH_URL` (set explicitly in production — especially when using a custom
 * domain so it matches Dexcom/Strava redirect URIs). On Vercel, falls back to
 * `VERCEL_URL` when `AUTH_URL` is unset so deploys work without extra config.
 */
export function getPublicAppBaseUrl(): string {
  const explicit = process.env.AUTH_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${host}`;
  }

  return "http://localhost:4000";
}
