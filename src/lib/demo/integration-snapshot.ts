import type { IntegrationSnapshot } from "@/components/settings-integrations";

/** Static payload for `/demo/settings` — mirrors a typical connected state without hitting the DB. */
export const DEMO_SETTINGS_INTEGRATION_SNAPSHOT: IntegrationSnapshot = {
  dexcom: {
    connected: true,
    lastSyncAt: "2026-05-08T14:30:00.000Z",
    readingCount: 12_400,
    shareCredentialsMode: false,
  },
  strava: {
    connected: true,
    lastSyncAt: "2026-05-08T10:15:00.000Z",
    activityCount: 156,
  },
  steps: {
    connected: true,
    lastIngestAt: "2026-05-09T07:12:00.000Z",
    stepsTotalStored: 8420,
    lastStored: {
      bucketStartIso: "2026-05-09T18:00:00.000Z",
      stepCount: 420,
      source: "demo_preview",
      receivedAtIso: "2026-05-09T19:05:00.000Z",
    },
    recentRows: [
      {
        bucketStartIso: "2026-05-09T18:00:00.000Z",
        stepCount: 420,
        source: "demo_preview",
        receivedAtIso: "2026-05-09T19:05:00.000Z",
      },
      {
        bucketStartIso: "2026-05-09T17:00:00.000Z",
        stepCount: 310,
        source: "demo_preview",
        receivedAtIso: "2026-05-09T18:02:00.000Z",
      },
    ],
  },
};
