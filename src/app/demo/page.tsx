import { DayInsightsPanel } from "@/components/day-insights-panel";
import { DaySummaryCards } from "@/components/day-summary-cards";
import { DateNav } from "@/components/date-nav";
import { DailyViewChart } from "@/components/daily-view-chart";

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function DemoPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const dateParam = readParam(params, "date");
  const selectedDateYmd =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 bg-background px-4 py-6 md:gap-8 md:px-8 md:py-10">
      <DateNav initialDateYmd={selectedDateYmd} />
      <DailyViewChart dateYmd={selectedDateYmd} />
      <DaySummaryCards dateYmd={selectedDateYmd} />
      <DayInsightsPanel key={`demo-insights-${selectedDateYmd}`} dateYmd={selectedDateYmd} />
    </main>
  );
}
