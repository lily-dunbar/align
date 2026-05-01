import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { getOrCreateStepIngestToken } from "@/lib/steps/token-store";
import { StepIngestUrlCard } from "@/components/step-ingest-url-card";

function appBaseUrl() {
  return (process.env.AUTH_URL ?? "http://localhost:4000").replace(/\/$/, "");
}

export default async function SettingsPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const token = await getOrCreateStepIngestToken(userId);
  const ingestUrl = `${appBaseUrl()}/api/ingest/steps/${token}`;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <Link href="/" className="rounded border px-3 py-1.5 text-sm">
          Back to home
        </Link>
      </div>

      <StepIngestUrlCard
        initialIngestUrl={ingestUrl}
        tokenEndpoint="/api/ingest/steps/token"
      />
    </main>
  );
}
