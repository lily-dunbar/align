/** Safe in-app path only (used for OAuth / sync redirects). */
export function sanitizeOAuthReturnTo(raw: string | null | undefined): string | undefined {
  if (raw == null) return undefined;
  const s = raw.trim();
  if (!s || s.length > 256) return undefined;
  if (!s.startsWith("/")) return undefined;
  if (s.startsWith("//")) return undefined;
  if (s.includes("://")) return undefined;
  if (s.includes("\\")) return undefined;
  return s;
}
