import { DisplayPreferencesCard } from "@/components/display-preferences-card";
import { SettingsTargetsCard } from "@/components/settings-targets-card";

export default async function DemoSettingsPage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col gap-8 bg-background px-4 py-8 md:max-w-4xl md:px-8 md:py-10">
      <DisplayPreferencesCard />
      <SettingsTargetsCard />
    </main>
  );
}
