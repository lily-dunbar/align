/** Developer-only Settings UI (demo toggle, resets). Off in production unless opted in. */
export function isDeveloperSettingsEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const v = process.env.ENABLE_DEVELOPER_SETTINGS?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
