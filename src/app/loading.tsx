import { DailyDashboardSkeleton } from "@/components/skeleton";

export default function HomeLoading() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col gap-8 bg-background px-4 py-8 md:px-8 md:py-10">
      <DailyDashboardSkeleton />
    </main>
  );
}
