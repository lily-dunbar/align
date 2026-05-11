import { PatternsPageSkeleton } from "@/components/skeleton";

export default function PatternsLoading() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 bg-background px-4 py-6 md:gap-8 md:px-8 md:py-10">
      <PatternsPageSkeleton />
    </main>
  );
}
