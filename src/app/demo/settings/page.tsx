import { DisplayPreferencesCard } from "@/components/display-preferences-card";
import { SettingsIntegrations } from "@/components/settings-integrations";
import { SettingsTargetsCard } from "@/components/settings-targets-card";
import { DEMO_SETTINGS_INTEGRATION_SNAPSHOT } from "@/lib/demo/integration-snapshot";

export default async function DemoSettingsPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 bg-background px-4 py-6 md:max-w-4xl md:gap-8 md:px-8 md:py-10">
      <SettingsIntegrations initial={DEMO_SETTINGS_INTEGRATION_SNAPSHOT} readOnly />
      <DisplayPreferencesCard />
      <SettingsTargetsCard />
    </main>
  );
}
