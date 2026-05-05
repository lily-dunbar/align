export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  const { startShortcutsAutoSyncScheduler } = await import(
    "@/lib/integrations/health/shortcuts-auto-sync"
  );
  startShortcutsAutoSyncScheduler();
}
