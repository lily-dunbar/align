import { DisplayPreferencesCard } from "@/components/display-preferences-card";
import { SettingsTargetsCard } from "@/components/settings-targets-card";

export default async function DemoSettingsPage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col gap-8 bg-background px-4 py-8 md:max-w-4xl md:px-8 md:py-10">
      <div className="rounded-2xl border border-align-border/90 bg-white/90 p-4 text-sm text-zinc-700 ring-1 ring-black/[0.03]">
        Public demo settings. Changes apply to synthetic demo data only.
      </div>
      <DisplayPreferencesCard />
      <SettingsTargetsCard />
    </main>
  );
}
