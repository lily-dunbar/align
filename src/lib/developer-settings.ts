/** Developer-only Settings UI (demo toggle, resets). Off in production unless opted in. */
export function isDeveloperSettingsEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const v = process.env.ENABLE_DEVELOPER_SETTINGS?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function parseUserIdAllowlist(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Production: these Clerk user IDs may toggle per-account demo mode in Settings even when
 * `ENABLE_DEVELOPER_SETTINGS` is off. Comma- or whitespace-separated list in env.
 */
export function isDemoModeSelfServeUser(userId: string): boolean {
  return parseUserIdAllowlist(process.env.DEMO_MODE_SELF_SERVE_USER_IDS).has(userId);
}

export function canUserPatchDeveloperDemoMode(userId: string): boolean {
  return isDeveloperSettingsEnabled() || isDemoModeSelfServeUser(userId);
}
