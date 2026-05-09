/** Developer-only Settings UI (demo toggle, resets). Off in production unless opted in. */
export function isDeveloperSettingsEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const v = process.env.ENABLE_DEVELOPER_SETTINGS?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function parseDeveloperUserIdAllowlist(): Set<string> {
  const raw =
    process.env.DEVELOPER_MODE_USER_IDS ??
    process.env.DEV_MODE_USER_IDS ??
    process.env.DEVELOPER_USER_IDS ??
    "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(ids);
}

/** Only allowlisted accounts may access Developer/Demo mode controls. */
export function canUserPatchDeveloperDemoMode(userId: string): boolean {
  const allow = parseDeveloperUserIdAllowlist();
  return allow.has(userId);
}
