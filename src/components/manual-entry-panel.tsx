"use client";

import { startTransition, useEffect, useMemo, useState } from "react";

import { Skeleton } from "@/components/skeleton";
import type { SleepRecurrenceFreq } from "@/lib/manual/sleep-recurrence";
import { parseSleepRecurrenceMeta } from "@/lib/manual/sleep-recurrence";
import { METERS_PER_MILE } from "@/lib/distance-units";
import { DAY_DATA_CHANGED_EVENT, OPEN_MANUAL_MODAL_EVENT } from "@/lib/day-view-events";
import { useResolvedDayYmd } from "@/lib/use-resolved-day-ymd";

type Workout = {
  id: string;
  workoutType: string;
  startedAt: string;
  endedAt: string | null;
  distanceMeters: number | null;
  pace: string | null;
  durationMin: number | null;
  intensity: string | null;
  notes: string | null;
};

type FoodEntry = {
  id: string;
  title: string;
  eatenAt: string;
  carbsGrams: number | null;
};

type SleepRow = {
  id: string;
  sleepStart: string;
  sleepEnd: string;
  source: string;
  qualityScore: number | null;
  notes: string | null;
};

type Props = {
  dateYmd: string;
  showCard?: boolean;
};

const WORKOUT_TYPES: { key: string; emoji: string; label: string }[] = [
  { key: "Walk", emoji: "🚶", label: "Walk" },
  { key: "Run", emoji: "🏃", label: "Run" },
  { key: "Bike", emoji: "🚴", label: "Bike" },
  { key: "Swim", emoji: "🏊", label: "Swim" },
];

const FOOD_PRESETS: { emoji: string; title: string; hint: string; carbsHint?: string }[] = [
  { emoji: "🍃", title: "Low impact", hint: "30m", carbsHint: "20" },
  { emoji: "⚡", title: "Fast acting", hint: "1h", carbsHint: "20" },
  { emoji: "🕒", title: "Med acting", hint: "2h", carbsHint: "40" },
  { emoji: "🐌", title: "Slow acting", hint: "3h", carbsHint: "60" },
];

function toIsoFromDateTime(date: string, time: string) {
  return new Date(`${date}T${time}`).toISOString();
}

function toLocalDateInput(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toLocalTimeInput(iso: string) {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

function isSameLocalDay(iso: string, ymd: string) {
  const d = new Date(iso);
  const [y, m, day] = ymd.split("-").map(Number);
  return d.getFullYear() === y && d.getMonth() + 1 === m && d.getDate() === day;
}

function prevYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function formatHeaderDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function recurrenceLabel(notes: string | null): string | null {
  const meta = parseSleepRecurrenceMeta(notes);
  if (!meta) return null;
  return meta.freq === "daily" ? "Repeats daily" : "Repeats weekly";
}

function notifyDayDataChanged() {
  window.dispatchEvent(new CustomEvent(DAY_DATA_CHANGED_EVENT));
}

function metersToMiles(m: number | null): string {
  if (m == null || !Number.isFinite(m)) return "";
  return (m / METERS_PER_MILE).toFixed(2);
}

function computePacePerMi(startTime: string, endTime: string, miles: number): string {
  if (!startTime || !endTime || !Number.isFinite(miles) || miles <= 0) return "";
  const base = "2000-01-01";
  const startMs = new Date(`${base}T${startTime}`).getTime();
  let endMs = new Date(`${base}T${endTime}`).getTime();
  if (endMs <= startMs) endMs += 86400000;
  const min = (endMs - startMs) / 60000;
  if (min <= 0) return "";
  const paceMinPerMi = min / miles;
  const pm = Math.floor(paceMinPerMi);
  const ps = Math.round((paceMinPerMi - pm) * 60);
  if (ps === 60) return `${pm + 1}:00 /mi`;
  return `${pm}:${String(ps).padStart(2, "0")} /mi`;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-align-muted">
      {children}
    </span>
  );
}

function inputClass(short?: boolean) {
  return [
    "w-full rounded-xl border border-align-border/90 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm",
    "outline-none transition placeholder:text-zinc-400",
    "focus:border-align-forest focus:ring-2 focus:ring-align-forest/20",
    short ? "tabular-nums" : "",
  ].join(" ");
}

export function ManualEntryPanel({ dateYmd, showCard = true }: Props) {
  const resolvedDateYmd = useResolvedDayYmd(dateYmd);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [foods, setFoods] = useState<FoodEntry[]>([]);
  const [sleeps, setSleeps] = useState<SleepRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<"sleep" | "activity" | "food">("activity");

  const [sleepForm, setSleepForm] = useState({
    bedDate: prevYmd(dateYmd),
    bedTime: "22:00",
    wakeDate: dateYmd,
    wakeTime: "07:00",
    recurring: false,
    recurrenceFreq: "weekly" as SleepRecurrenceFreq,
  });

  const [workoutForm, setWorkoutForm] = useState({
    workoutType: "Walk",
    date: dateYmd,
    startTime: "08:00",
    endTime: "08:45",
    distanceMiles: "",
    pace: "",
    notes: "",
  });

  const [foodForm, setFoodForm] = useState({
    date: dateYmd,
    time: "12:00",
    title: "Meal",
    carbsGrams: "",
  });

  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null);
  const [editingSleepId, setEditingSleepId] = useState<string | null>(null);

  const computedPace = useMemo(() => {
    const miles = parseFloat(workoutForm.distanceMiles);
    return computePacePerMi(workoutForm.startTime, workoutForm.endTime, miles);
  }, [workoutForm.startTime, workoutForm.endTime, workoutForm.distanceMiles]);

  useEffect(() => {
    startTransition(() => {
      setWorkoutForm((s) => ({ ...s, date: resolvedDateYmd }));
      setFoodForm((s) => ({ ...s, date: resolvedDateYmd }));
      setSleepForm((s) => ({
        ...s,
        bedDate: prevYmd(resolvedDateYmd),
        wakeDate: resolvedDateYmd,
        recurring: false,
        recurrenceFreq: "weekly",
      }));
    });
  }, [resolvedDateYmd]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [wResp, fResp, sResp] = await Promise.all([
        fetch("/api/manual/workouts", { cache: "no-store" }),
        fetch("/api/manual/food", { cache: "no-store" }),
        fetch("/api/manual/sleep", { cache: "no-store" }),
      ]);
      const wJson = (await wResp.json()) as { items?: Workout[]; error?: string };
      const fJson = (await fResp.json()) as { items?: FoodEntry[]; error?: string };
      const sJson = (await sResp.json()) as { items?: SleepRow[]; error?: string };
      if (!wResp.ok) throw new Error(wJson.error ?? "Failed to load workouts");
      if (!fResp.ok) throw new Error(fJson.error ?? "Failed to load food");
      if (!sResp.ok) throw new Error(sJson.error ?? "Failed to load sleep");
      setWorkouts(wJson.items ?? []);
      setFoods(fJson.items ?? []);
      setSleeps(sJson.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load manual entries");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const [wResp, fResp, sResp] = await Promise.all([
          fetch("/api/manual/workouts", { cache: "no-store" }),
          fetch("/api/manual/food", { cache: "no-store" }),
          fetch("/api/manual/sleep", { cache: "no-store" }),
        ]);
        const wJson = (await wResp.json()) as { items?: Workout[]; error?: string };
        const fJson = (await fResp.json()) as { items?: FoodEntry[]; error?: string };
        const sJson = (await sResp.json()) as { items?: SleepRow[]; error?: string };
        if (!wResp.ok) throw new Error(wJson.error ?? "Failed to load workouts");
        if (!fResp.ok) throw new Error(fJson.error ?? "Failed to load food");
        if (!sResp.ok) throw new Error(sJson.error ?? "Failed to load sleep");
        if (!cancelled) {
          setWorkouts(wJson.items ?? []);
          setFoods(fJson.items ?? []);
          setSleeps(sJson.items ?? []);
          setError(null);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load manual entries");
          setLoading(false);
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleOpen() {
      setTab("activity");
      setWorkoutForm((s) => ({ ...s, date: resolvedDateYmd }));
      setFoodForm((s) => ({ ...s, date: resolvedDateYmd }));
      setSleepForm({
        bedDate: prevYmd(resolvedDateYmd),
        bedTime: "22:00",
        wakeDate: resolvedDateYmd,
        wakeTime: "07:00",
        recurring: false,
        recurrenceFreq: "weekly",
      });
      setIsOpen(true);
    }
    window.addEventListener(OPEN_MANUAL_MODAL_EVENT, handleOpen);
    return () => {
      window.removeEventListener(OPEN_MANUAL_MODAL_EVENT, handleOpen);
    };
  }, [resolvedDateYmd]);

  const workoutsForDate = useMemo(
    () => workouts.filter((w) => isSameLocalDay(w.startedAt, resolvedDateYmd)),
    [workouts, resolvedDateYmd],
  );

  const foodForDate = useMemo(
    () => foods.filter((f) => isSameLocalDay(f.eatenAt, resolvedDateYmd)),
    [foods, resolvedDateYmd],
  );

  const sleepForDate = useMemo(
    () =>
      sleeps.filter(
        (s) =>
          isSameLocalDay(s.sleepStart, resolvedDateYmd) ||
          isSameLocalDay(s.sleepEnd, resolvedDateYmd),
      ),
    [sleeps, resolvedDateYmd],
  );

  const dayEntryCount =
    sleepForDate.length + workoutsForDate.length + foodForDate.length;

  function openModal() {
    setTab("activity");
    setWorkoutForm((s) => ({ ...s, date: resolvedDateYmd }));
    setFoodForm((s) => ({ ...s, date: resolvedDateYmd }));
    setSleepForm({
      bedDate: prevYmd(resolvedDateYmd),
      bedTime: "22:00",
      wakeDate: resolvedDateYmd,
      wakeTime: "07:00",
      recurring: false,
      recurrenceFreq: "weekly",
    });
    setIsOpen(true);
  }

  async function createSleep() {
    setError(null);
    const resp = await fetch("/api/manual/sleep", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sleepStart: toIsoFromDateTime(sleepForm.bedDate, sleepForm.bedTime),
        sleepEnd: toIsoFromDateTime(sleepForm.wakeDate, sleepForm.wakeTime),
        recurrence: sleepForm.recurring
          ? { enabled: true, freq: sleepForm.recurrenceFreq }
          : { enabled: false },
      }),
    });
    const json = (await resp.json()) as { item?: SleepRow; error?: string };
    if (!resp.ok || !json.item) {
      setError(json.error ?? "Failed to save sleep");
      return;
    }
    setSleepForm({
      bedDate: prevYmd(resolvedDateYmd),
      bedTime: "22:00",
      wakeDate: resolvedDateYmd,
      wakeTime: "07:00",
      recurring: false,
      recurrenceFreq: "weekly",
    });
    await loadAll();
    notifyDayDataChanged();
  }

  async function saveSleep(item: SleepRow) {
    const resp = await fetch(`/api/manual/sleep/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sleepStart: item.sleepStart,
        sleepEnd: item.sleepEnd,
        notes: item.notes,
      }),
    });
    const json = (await resp.json()) as { error?: string };
    if (!resp.ok) {
      setError(json.error ?? "Failed to update sleep");
      return;
    }
    setEditingSleepId(null);
    await loadAll();
    notifyDayDataChanged();
  }

  async function deleteSleep(item: SleepRow) {
    const recur = parseSleepRecurrenceMeta(item.notes);
    let url = `/api/manual/sleep/${item.id}`;
    if (recur?.seriesId) {
      const thisDay = window.confirm(
        "Delete only this sleep entry?\n\nPress OK for just this day, or Cancel for more options.",
      );
      if (!thisDay) {
        const future = window.confirm(
          "Delete this entry and all future repeated sleep entries in this series?",
        );
        if (!future) return;
        url += "?scope=future";
      }
    }
    await fetch(url, { method: "DELETE" });
    await loadAll();
    notifyDayDataChanged();
  }

  async function createWorkout() {
    setError(null);
    const miles = workoutForm.distanceMiles ? Number(workoutForm.distanceMiles) : null;
    const paceSubmit =
      workoutForm.pace.trim() || (computedPace && computedPace !== "" ? computedPace : null);
    const resp = await fetch("/api/manual/workouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workoutType: workoutForm.workoutType,
        startedAt: toIsoFromDateTime(workoutForm.date, workoutForm.startTime),
        endedAt: workoutForm.endTime
          ? toIsoFromDateTime(workoutForm.date, workoutForm.endTime)
          : null,
        distanceMeters:
          miles != null && Number.isFinite(miles) && miles > 0
            ? Math.round(miles * METERS_PER_MILE)
            : null,
        pace: paceSubmit,
        notes: workoutForm.notes || null,
      }),
    });
    const json = (await resp.json()) as { item?: Workout; error?: string };
    if (!resp.ok || !json.item) {
      setError(json.error ?? "Failed to create workout");
      return;
    }
    setWorkoutForm({
      workoutType: "Walk",
      date: resolvedDateYmd,
      startTime: "08:00",
      endTime: "08:45",
      distanceMiles: "",
      pace: "",
      notes: "",
    });
    await loadAll();
    notifyDayDataChanged();
  }

  async function createFood() {
    setError(null);
    const resp = await fetch("/api/manual/food", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: foodForm.title.trim() || "Meal",
        eatenAt: toIsoFromDateTime(foodForm.date, foodForm.time),
        carbsGrams: foodForm.carbsGrams ? Number(foodForm.carbsGrams) : null,
      }),
    });
    const json = (await resp.json()) as { item?: FoodEntry; error?: string };
    if (!resp.ok || !json.item) {
      setError(json.error ?? "Failed to create food entry");
      return;
    }
    setFoodForm({
      date: resolvedDateYmd,
      time: "12:00",
      title: "Meal",
      carbsGrams: "",
    });
    await loadAll();
    notifyDayDataChanged();
  }

  async function saveWorkout(item: Workout) {
    const resp = await fetch(`/api/manual/workouts/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workoutType: item.workoutType,
        startedAt: item.startedAt,
        endedAt: item.endedAt,
        distanceMeters: item.distanceMeters,
        pace: item.pace,
        notes: item.notes,
      }),
    });
    const json = (await resp.json()) as { error?: string };
    if (!resp.ok) {
      setError(json.error ?? "Failed to update workout");
      return;
    }
    setEditingWorkoutId(null);
    await loadAll();
    notifyDayDataChanged();
  }

  async function saveFood(item: FoodEntry) {
    const resp = await fetch(`/api/manual/food/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: item.title,
        eatenAt: item.eatenAt,
        carbsGrams: item.carbsGrams,
      }),
    });
    const json = (await resp.json()) as { error?: string };
    if (!resp.ok) {
      setError(json.error ?? "Failed to update food entry");
      return;
    }
    setEditingFoodId(null);
    await loadAll();
    notifyDayDataChanged();
  }

  async function deleteWorkout(id: string) {
    await fetch(`/api/manual/workouts/${id}`, { method: "DELETE" });
    await loadAll();
    notifyDayDataChanged();
  }

  async function deleteFood(id: string) {
    await fetch(`/api/manual/food/${id}`, { method: "DELETE" });
    await loadAll();
    notifyDayDataChanged();
  }

  const tabBtn = (active: boolean) =>
    [
      "rounded-full px-4 py-2 text-sm font-medium transition-all duration-200",
      active
        ? "bg-align-forest text-white shadow-sm shadow-black/10"
        : "border border-align-border/90 bg-white text-zinc-600 shadow-sm shadow-black/[0.02] hover:bg-align-subtle hover:text-zinc-900",
    ].join(" ");

  return (
    <>
      {showCard ? (
        <section className="w-full overflow-hidden rounded-2xl border border-align-border/90 bg-white/90 p-5 text-left shadow-sm ring-1 ring-black/[0.03]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
                Log your day
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                Sleep, movement, and food for{" "}
                <span className="font-semibold text-align-forest">{formatHeaderDate(resolvedDateYmd)}</span>
              </p>
            </div>
            <button
              type="button"
              className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-align-forest px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-black/10 transition hover:bg-align-forest-muted disabled:opacity-50"
              disabled={loading}
              onClick={openModal}
            >
              <span className="text-base transition group-hover:rotate-12" aria-hidden>
                ✨
              </span>
              Add entry
            </button>
          </div>
          <p className="mt-3 text-sm text-zinc-600" aria-live={loading ? "polite" : undefined}>
            {loading ? (
              <span className="flex flex-col gap-2">
                <Skeleton className="h-4 w-48 max-w-full" />
                <Skeleton className="h-4 w-32 max-w-full" />
              </span>
            ) : (
              `${dayEntryCount} entr${dayEntryCount === 1 ? "y" : "ies"} on this day`
            )}
          </p>
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        </section>
      ) : null}

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="manual-entry-title"
        >
          <div className="manual-entry-modal max-h-[92vh] w-full max-w-lg overflow-hidden rounded-2xl border border-align-border/90 bg-white shadow-[0_20px_50px_-12px_rgba(27,77,67,0.2)] ring-1 ring-black/[0.04]">
            <div className="max-h-[92vh] overflow-y-auto px-5 pb-6 pt-5 sm:px-6">
              {!showCard && error ? (
                <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              ) : null}

              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3
                    id="manual-entry-title"
                    className="text-xl font-bold tracking-tight text-zinc-900"
                  >
                    Add / edit entries
                  </h3>
                  <p className="mt-0.5 text-sm font-medium text-align-muted">
                    {formatHeaderDate(resolvedDateYmd)}
                  </p>
                </div>
                <button
                  type="button"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-align-border/90 bg-align-subtle text-zinc-500 transition hover:border-align-border hover:bg-white hover:text-zinc-800"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={tabBtn(tab === "sleep")}
                  onClick={() => setTab("sleep")}
                >
                  😴 Add Sleep
                </button>
                <button
                  type="button"
                  className={tabBtn(tab === "activity")}
                  onClick={() => setTab("activity")}
                >
                  🏃 Add/Edit Activity
                </button>
                <button
                  type="button"
                  className={tabBtn(tab === "food")}
                  onClick={() => setTab("food")}
                >
                  🍽 Add Food
                </button>
              </div>

              <div className="mt-6 space-y-5">
                {tab === "sleep" ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <FieldLabel>Bed date</FieldLabel>
                        <input
                          type="date"
                          className={inputClass(true)}
                          value={sleepForm.bedDate}
                          onChange={(e) =>
                            setSleepForm((s) => ({ ...s, bedDate: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <FieldLabel>Bed time</FieldLabel>
                        <input
                          type="time"
                          className={inputClass(true)}
                          value={sleepForm.bedTime}
                          onChange={(e) =>
                            setSleepForm((s) => ({ ...s, bedTime: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <FieldLabel>Wake date</FieldLabel>
                        <input
                          type="date"
                          className={inputClass(true)}
                          value={sleepForm.wakeDate}
                          onChange={(e) =>
                            setSleepForm((s) => ({ ...s, wakeDate: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <FieldLabel>Wake time</FieldLabel>
                        <input
                          type="time"
                          className={inputClass(true)}
                          value={sleepForm.wakeTime}
                          onChange={(e) =>
                            setSleepForm((s) => ({ ...s, wakeTime: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-align-border/80 bg-white px-3 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-align-border text-align-forest focus:ring-align-forest/30"
                        checked={sleepForm.recurring}
                        onChange={(e) =>
                          setSleepForm((s) => ({ ...s, recurring: e.target.checked }))
                        }
                      />
                      <FieldLabel>Repeats</FieldLabel>
                    </label>
                    {sleepForm.recurring ? (
                      <div className="space-y-1.5">
                        <FieldLabel>Repeat cadence</FieldLabel>
                        <select
                          className={inputClass()}
                          value={sleepForm.recurrenceFreq}
                          onChange={(e) =>
                            setSleepForm((s) => ({
                              ...s,
                              recurrenceFreq: e.target.value as SleepRecurrenceFreq,
                            }))
                          }
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                        </select>
                        <p className="text-xs text-zinc-500">
                          You can delete a single day later, or delete all future repeats from any entry.
                        </p>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="w-full rounded-full bg-align-forest py-3 text-sm font-semibold text-white shadow-sm shadow-black/10 transition hover:bg-align-forest-muted active:scale-[0.99]"
                      onClick={() => void createSleep()}
                    >
                      Add sleep
                    </button>
                  </>
                ) : null}

                {tab === "activity" ? (
                  <>
                    <div className="space-y-2">
                      <FieldLabel>Type</FieldLabel>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {WORKOUT_TYPES.map((t) => {
                          const sel = workoutForm.workoutType === t.key;
                          return (
                            <button
                              key={t.key}
                              type="button"
                              aria-pressed={sel}
                              onClick={() =>
                                setWorkoutForm((s) => ({ ...s, workoutType: t.key }))
                              }
                              className={[
                                "flex flex-col items-center gap-1 rounded-2xl border-2 py-3 text-sm font-medium transition duration-150",
                                sel
                                  ? "border-align-forest bg-align-nav-active text-align-forest shadow-sm shadow-black/5"
                                  : "border-align-border/80 bg-white text-zinc-600 hover:border-align-border hover:bg-align-subtle active:scale-[0.98]",
                              ].join(" ")}
                            >
                              <span className="text-2xl leading-none">{t.emoji}</span>
                              {t.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <FieldLabel>Start</FieldLabel>
                        <input
                          type="time"
                          className={inputClass(true)}
                          value={workoutForm.startTime}
                          onChange={(e) =>
                            setWorkoutForm((s) => ({ ...s, startTime: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <FieldLabel>End</FieldLabel>
                        <input
                          type="time"
                          className={inputClass(true)}
                          value={workoutForm.endTime}
                          onChange={(e) =>
                            setWorkoutForm((s) => ({ ...s, endTime: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel>Miles (optional)</FieldLabel>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={inputClass(true)}
                        placeholder="e.g. 3.10"
                        value={workoutForm.distanceMiles}
                        onChange={(e) =>
                          setWorkoutForm((s) => ({ ...s, distanceMiles: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel>Pace (optional, auto)</FieldLabel>
                      <input
                        type="text"
                        className={inputClass()}
                        placeholder="—"
                        value={workoutForm.pace}
                        onChange={(e) =>
                          setWorkoutForm((s) => ({ ...s, pace: e.target.value }))
                        }
                      />
                      {computedPace && !workoutForm.pace.trim() ? (
                        <p className="text-xs text-align-forest-muted">
                          Suggested from time & distance:{" "}
                          <span className="font-mono font-medium">{computedPace}</span>
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="w-full rounded-full bg-align-forest py-3 text-sm font-semibold text-white shadow-sm shadow-black/10 transition hover:bg-align-forest-muted active:scale-[0.99]"
                      onClick={() => void createWorkout()}
                    >
                      Add activity
                    </button>
                  </>
                ) : null}

                {tab === "food" ? (
                  <>
                    <div className="space-y-1.5">
                      <FieldLabel>Time (first bite)</FieldLabel>
                      <input
                        type="time"
                        className={inputClass(true)}
                        value={foodForm.time}
                        onChange={(e) => setFoodForm((s) => ({ ...s, time: e.target.value }))}
                      />
                    </div>
                    <div className="rounded-2xl border border-dashed border-align-border/90 bg-align-subtle/40 p-4">
                      <FieldLabel>Type (optional)</FieldLabel>
                      <p className="mb-3 text-xs text-zinc-500">
                        Quick picks — typical glucose curve length as a hint, not medical advice.
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {FOOD_PRESETS.map((p) => (
                          <button
                            key={p.title}
                            type="button"
                            className="flex flex-col items-center gap-0.5 rounded-xl border border-align-border/80 bg-white py-3 text-center shadow-sm transition hover:border-align-forest/40 hover:bg-align-subtle/50 active:scale-[0.98]"
                            onClick={() =>
                              setFoodForm((s) => ({
                                ...s,
                                title: p.title,
                                carbsGrams: p.carbsHint ?? s.carbsGrams,
                              }))
                            }
                          >
                            <span className="text-2xl">{p.emoji}</span>
                            <span className="text-[10px] font-semibold text-align-forest">{p.hint}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel>Label</FieldLabel>
                      <input
                        type="text"
                        className={inputClass()}
                        value={foodForm.title}
                        onChange={(e) => setFoodForm((s) => ({ ...s, title: e.target.value }))}
                        placeholder="What did you eat?"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel>Carbs (g), optional</FieldLabel>
                      <input
                        type="number"
                        min="0"
                        className={inputClass(true)}
                        placeholder="e.g. 45"
                        value={foodForm.carbsGrams}
                        onChange={(e) =>
                          setFoodForm((s) => ({ ...s, carbsGrams: e.target.value }))
                        }
                      />
                    </div>
                    <button
                      type="button"
                      className="w-full rounded-full bg-align-forest py-3 text-sm font-semibold text-white shadow-sm shadow-black/10 transition hover:bg-align-forest-muted active:scale-[0.99]"
                      onClick={() => void createFood()}
                    >
                      Add food
                    </button>
                  </>
                ) : null}
              </div>

              <div className="my-6 h-px bg-align-border-soft" />

              <div className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                  On this day
                </p>
                {dayEntryCount === 0 ? (
                  <p className="rounded-2xl border border-align-border-soft bg-align-subtle/30 px-4 py-6 text-center text-sm leading-relaxed text-zinc-500">
                    <span className="text-lg not-italic" aria-hidden>
                      🌤️
                    </span>
                    <br />
                    No sleep, food, or walk/run entries for this day yet.
                    <br />
                    <span className="text-xs text-align-forest-muted">Add one above — you got this.</span>
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {sleepForDate.map((s) => {
                      const editing = editingSleepId === s.id;
                      return (
                        <li
                          key={s.id}
                          className="rounded-2xl border border-align-border/80 bg-white p-3 text-sm shadow-sm"
                        >
                          {editing ? (
                            <div className="grid gap-2">
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  type="date"
                                  className={inputClass(true)}
                                  value={toLocalDateInput(s.sleepStart)}
                                  onChange={(e) =>
                                    setSleeps((rows) =>
                                      rows.map((r) =>
                                        r.id === s.id
                                          ? {
                                              ...r,
                                              sleepStart: toIsoFromDateTime(
                                                e.target.value,
                                                toLocalTimeInput(r.sleepStart),
                                              ),
                                            }
                                          : r,
                                      ),
                                    )
                                  }
                                />
                                <input
                                  type="time"
                                  className={inputClass(true)}
                                  value={toLocalTimeInput(s.sleepStart)}
                                  onChange={(e) =>
                                    setSleeps((rows) =>
                                      rows.map((r) =>
                                        r.id === s.id
                                          ? {
                                              ...r,
                                              sleepStart: toIsoFromDateTime(
                                                toLocalDateInput(r.sleepStart),
                                                e.target.value,
                                              ),
                                            }
                                          : r,
                                      ),
                                    )
                                  }
                                />
                                <input
                                  type="date"
                                  className={inputClass(true)}
                                  value={toLocalDateInput(s.sleepEnd)}
                                  onChange={(e) =>
                                    setSleeps((rows) =>
                                      rows.map((r) =>
                                        r.id === s.id
                                          ? {
                                              ...r,
                                              sleepEnd: toIsoFromDateTime(
                                                e.target.value,
                                                toLocalTimeInput(r.sleepEnd),
                                              ),
                                            }
                                          : r,
                                      ),
                                    )
                                  }
                                />
                                <input
                                  type="time"
                                  className={inputClass(true)}
                                  value={toLocalTimeInput(s.sleepEnd)}
                                  onChange={(e) =>
                                    setSleeps((rows) =>
                                      rows.map((r) =>
                                        r.id === s.id
                                          ? {
                                              ...r,
                                              sleepEnd: toIsoFromDateTime(
                                                toLocalDateInput(r.sleepEnd),
                                                e.target.value,
                                              ),
                                            }
                                          : r,
                                      ),
                                    )
                                  }
                                />
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  className="rounded-lg bg-align-forest px-3 py-1.5 text-xs font-medium text-white hover:bg-align-forest-muted"
                                  onClick={() => void saveSleep(s)}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-800 hover:bg-zinc-50"
                                  onClick={() => setEditingSleepId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="font-medium text-zinc-900">
                                  😴 Sleep ·{" "}
                                  {new Date(s.sleepStart).toLocaleTimeString(undefined, {
                                    hour: "numeric",
                                    minute: "2-digit",
                                  })}{" "}
                                  →{" "}
                                  {new Date(s.sleepEnd).toLocaleTimeString(undefined, {
                                    hour: "numeric",
                                    minute: "2-digit",
                                  })}
                                </p>
                                {recurrenceLabel(s.notes) ? (
                                  <p className="text-xs text-align-forest-muted">{recurrenceLabel(s.notes)}</p>
                                ) : null}
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  className="rounded-lg border border-align-border/90 bg-white px-2 py-1 text-xs text-zinc-700 shadow-sm hover:bg-align-subtle"
                                  onClick={() => setEditingSleepId(s.id)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg bg-white px-2 py-1 text-xs text-red-600 ring-1 ring-red-200"
                                  onClick={() => void deleteSleep(s)}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                    {workoutsForDate.map((w) => {
                      const editing = editingWorkoutId === w.id;
                      return (
                        <li
                          key={w.id}
                          className="rounded-2xl border border-align-border/80 bg-white p-3 text-sm shadow-sm"
                        >
                          {editing ? (
                            <div className="grid gap-2">
                              <select
                                className={inputClass()}
                                value={w.workoutType}
                                onChange={(e) =>
                                  setWorkouts((rows) =>
                                    rows.map((r) =>
                                      r.id === w.id ? { ...r, workoutType: e.target.value } : r,
                                    ),
                                  )
                                }
                              >
                                {WORKOUT_TYPES.map((t) => (
                                  <option key={t.key} value={t.key}>
                                    {t.emoji} {t.label}
                                  </option>
                                ))}
                              </select>
                              <input
                                className={inputClass(true)}
                                type="date"
                                value={toLocalDateInput(w.startedAt)}
                                onChange={(e) =>
                                  setWorkouts((rows) =>
                                    rows.map((r) =>
                                      r.id === w.id
                                        ? {
                                            ...r,
                                            startedAt: toIsoFromDateTime(
                                              e.target.value,
                                              toLocalTimeInput(r.startedAt),
                                            ),
                                            endedAt: r.endedAt
                                              ? toIsoFromDateTime(
                                                  e.target.value,
                                                  toLocalTimeInput(r.endedAt),
                                                )
                                              : null,
                                          }
                                        : r,
                                    ),
                                  )
                                }
                              />
                              <input
                                className={inputClass(true)}
                                type="time"
                                value={toLocalTimeInput(w.startedAt)}
                                onChange={(e) =>
                                  setWorkouts((rows) =>
                                    rows.map((r) =>
                                      r.id === w.id
                                        ? {
                                            ...r,
                                            startedAt: toIsoFromDateTime(
                                              toLocalDateInput(r.startedAt),
                                              e.target.value,
                                            ),
                                          }
                                        : r,
                                    ),
                                  )
                                }
                              />
                              <input
                                className={inputClass(true)}
                                type="time"
                                value={w.endedAt ? toLocalTimeInput(w.endedAt) : ""}
                                onChange={(e) =>
                                  setWorkouts((rows) =>
                                    rows.map((r) =>
                                      r.id === w.id
                                        ? {
                                            ...r,
                                            endedAt: e.target.value
                                              ? toIsoFromDateTime(
                                                  toLocalDateInput(r.startedAt),
                                                  e.target.value,
                                                )
                                              : null,
                                          }
                                        : r,
                                    ),
                                  )
                                }
                              />
                              <input
                                className={inputClass(true)}
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Miles"
                                value={metersToMiles(w.distanceMeters)}
                                onChange={(e) =>
                                  setWorkouts((rows) =>
                                    rows.map((r) =>
                                      r.id === w.id
                                        ? {
                                            ...r,
                                            distanceMeters: e.target.value
                                              ? Math.round(Number(e.target.value) * METERS_PER_MILE)
                                              : null,
                                          }
                                        : r,
                                    ),
                                  )
                                }
                              />
                              <input
                                className={inputClass()}
                                placeholder="Pace"
                                value={w.pace ?? ""}
                                onChange={(e) =>
                                  setWorkouts((rows) =>
                                    rows.map((r) =>
                                      r.id === w.id ? { ...r, pace: e.target.value } : r,
                                    ),
                                  )
                                }
                              />
                              <input
                                className={inputClass()}
                                placeholder="Notes"
                                value={w.notes ?? ""}
                                onChange={(e) =>
                                  setWorkouts((rows) =>
                                    rows.map((r) =>
                                      r.id === w.id ? { ...r, notes: e.target.value } : r,
                                    ),
                                  )
                                }
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  className="rounded-lg bg-align-forest px-3 py-1.5 text-xs font-medium text-white hover:bg-align-forest-muted"
                                  onClick={() => void saveWorkout(w)}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-800 hover:bg-zinc-50"
                                  onClick={() => setEditingWorkoutId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="font-medium">
                                  {WORKOUT_TYPES.find((t) => t.key === w.workoutType)?.emoji}{" "}
                                  {w.workoutType}
                                </p>
                                <p className="text-xs text-zinc-500">
                                  {new Date(w.startedAt).toLocaleString()}
                                </p>
                                <p className="text-xs text-zinc-500">
                                  {w.distanceMeters != null
                                    ? `${metersToMiles(w.distanceMeters)} mi`
                                    : "No distance"}
                                  {w.pace ? ` · ${w.pace}` : ""}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  className="rounded-lg border border-align-border/90 bg-white px-2 py-1 text-xs text-zinc-700 shadow-sm hover:bg-align-subtle"
                                  onClick={() => setEditingWorkoutId(w.id)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg bg-white px-2 py-1 text-xs text-red-600 ring-1 ring-red-200"
                                  onClick={() => void deleteWorkout(w.id)}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                    {foodForDate.map((f) => {
                      const editing = editingFoodId === f.id;
                      return (
                        <li
                          key={f.id}
                          className="rounded-2xl border border-align-border/80 bg-white p-3 text-sm shadow-sm"
                        >
                          {editing ? (
                            <div className="grid gap-2">
                              <input
                                className={inputClass()}
                                placeholder="Label"
                                value={f.title}
                                onChange={(e) =>
                                  setFoods((rows) =>
                                    rows.map((r) =>
                                      r.id === f.id ? { ...r, title: e.target.value } : r,
                                    ),
                                  )
                                }
                              />
                              <input
                                className={inputClass(true)}
                                type="date"
                                value={toLocalDateInput(f.eatenAt)}
                                onChange={(e) =>
                                  setFoods((rows) =>
                                    rows.map((r) =>
                                      r.id === f.id
                                        ? {
                                            ...r,
                                            eatenAt: toIsoFromDateTime(
                                              e.target.value,
                                              toLocalTimeInput(r.eatenAt),
                                            ),
                                          }
                                        : r,
                                    ),
                                  )
                                }
                              />
                              <input
                                className={inputClass(true)}
                                type="time"
                                value={toLocalTimeInput(f.eatenAt)}
                                onChange={(e) =>
                                  setFoods((rows) =>
                                    rows.map((r) =>
                                      r.id === f.id
                                        ? {
                                            ...r,
                                            eatenAt: toIsoFromDateTime(
                                              toLocalDateInput(r.eatenAt),
                                              e.target.value,
                                            ),
                                          }
                                        : r,
                                    ),
                                  )
                                }
                              />
                              <input
                                className={inputClass(true)}
                                type="number"
                                min="0"
                                placeholder="Carbs (g)"
                                value={f.carbsGrams ?? ""}
                                onChange={(e) =>
                                  setFoods((rows) =>
                                    rows.map((r) =>
                                      r.id === f.id
                                        ? {
                                            ...r,
                                            carbsGrams: e.target.value
                                              ? Number(e.target.value)
                                              : null,
                                          }
                                        : r,
                                    ),
                                  )
                                }
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  className="rounded-lg bg-align-forest px-3 py-1.5 text-xs font-medium text-white hover:bg-align-forest-muted"
                                  onClick={() => void saveFood(f)}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-800 hover:bg-zinc-50"
                                  onClick={() => setEditingFoodId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="font-medium">
                                  🍽 {f.title}
                                  {f.carbsGrams != null ? ` · ${f.carbsGrams} g carbs` : ""}
                                </p>
                                <p className="text-xs text-zinc-500">
                                  {new Date(f.eatenAt).toLocaleString()}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  className="rounded-lg border border-align-border/90 bg-white px-2 py-1 text-xs text-zinc-700 shadow-sm hover:bg-align-subtle"
                                  onClick={() => setEditingFoodId(f.id)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg bg-white px-2 py-1 text-xs text-red-600 ring-1 ring-red-200"
                                  onClick={() => void deleteFood(f.id)}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <button
                type="button"
                className="mt-6 w-full rounded-full border border-align-border/90 bg-white py-3 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-align-subtle"
                onClick={() => setIsOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
