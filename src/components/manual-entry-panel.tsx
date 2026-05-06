"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";

import { Skeleton } from "@/components/skeleton";
import { LightToast } from "@/components/light-toast";
import { useEffectiveTimeZone } from "@/hooks/use-effective-timezone";
import type { SleepRecurrenceFreq } from "@/lib/manual/sleep-recurrence";
import { buildSleepRecurrenceNotes, parseSleepRecurrenceMeta } from "@/lib/manual/sleep-recurrence";
import { METERS_PER_MILE } from "@/lib/distance-units";
import {
  DAY_DATA_CHANGED_EVENT,
  OPEN_MANUAL_MODAL_EVENT,
  type OpenManualModalDetail,
} from "@/lib/day-view-events";
import {
  inferMealPeriodFromLocalTime,
  type InferredMealPeriod,
} from "@/lib/infer-meal-period";
import {
  isYmdSameDayInZone,
  utcIsoToZonedDateInput,
  utcIsoToZonedTimeInput,
  zonedDateTimeToUtcIso,
} from "@/lib/zoned-datetime-inputs";
import {
  foodTypeTagLabel,
  parseFoodTypeTag,
  toFoodTypeNote,
  type FoodTypeTag,
} from "@/lib/food-type-tag";
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
  notes: string | null;
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
  { key: "Misc cardio", emoji: "❤️", label: "Misc cardio" },
  { key: "Strength training", emoji: "🏋️", label: "Strength" },
  { key: "Yoga", emoji: "🧘", label: "Yoga" },
];

const FOOD_PRESETS: {
  emoji: string;
  typeTag: FoodTypeTag;
  title: string;
  hint: string;
  carbsHint?: string;
}[] = [
  { emoji: "🥗", typeTag: "low_impact", title: "Low impact", hint: "30m", carbsHint: "20" },
  {
    emoji: "🧃",
    typeTag: "fast_acting",
    title: "Fast acting",
    hint: "1h",
    carbsHint: "20",
  },
  { emoji: "🍽️", typeTag: "medium_acting", title: "Med acting", hint: "2h", carbsHint: "40" },
  { emoji: "🌯", typeTag: "slow_acting", title: "Slow acting", hint: "3h", carbsHint: "60" },
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

function suggestedTimeForMealPeriod(period: InferredMealPeriod): string {
  switch (period) {
    case "breakfast":
      return "08:00";
    case "lunch":
      return "12:30";
    case "dinner":
      return "18:30";
    case "snack":
    default:
      return "15:00";
  }
}

export function ManualEntryPanel({ dateYmd, showCard = true }: Props) {
  const resolvedDateYmd = useResolvedDayYmd(dateYmd);
  const effectiveTz = useEffectiveTimeZone();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [foods, setFoods] = useState<FoodEntry[]>([]);
  const [sleeps, setSleeps] = useState<SleepRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<"sleep" | "activity" | "food">("activity");
  const [focusedEdit, setFocusedEdit] = useState<OpenManualModalDetail["edit"] | null>(null);

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
    foodTypeTag: null as FoodTypeTag | null,
  });

  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null);
  const [editingSleepId, setEditingSleepId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  function showSuccessToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

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
    function handleOpen(event: Event) {
      const detail = (event as CustomEvent<OpenManualModalDetail>).detail;
      const nextFromEdit =
        detail?.edit?.kind === "sleep"
          ? "sleep"
          : detail?.edit?.kind === "food"
            ? "food"
            : detail?.edit?.kind === "activity"
              ? "activity"
              : undefined;
      const next = detail?.tab ?? nextFromEdit;
      setTab(next === "sleep" || next === "activity" || next === "food" ? next : "activity");
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
      setEditingWorkoutId(null);
      setEditingFoodId(null);
      setEditingSleepId(null);
      setFocusedEdit(detail?.edit ?? null);
      if (detail?.edit?.id) {
        if (detail.edit.kind === "activity") setEditingWorkoutId(detail.edit.id);
        if (detail.edit.kind === "food") setEditingFoodId(detail.edit.id);
        if (detail.edit.kind === "sleep") setEditingSleepId(detail.edit.id);
      }
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
    () => foods.filter((f) => isYmdSameDayInZone(f.eatenAt, resolvedDateYmd, effectiveTz)),
    [foods, resolvedDateYmd, effectiveTz],
  );

  const foodFormMealPreview = useMemo(() => {
    const iso = zonedDateTimeToUtcIso(foodForm.date, foodForm.time, effectiveTz);
    return inferMealPeriodFromLocalTime(iso, effectiveTz);
  }, [foodForm.date, foodForm.time, effectiveTz]);

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

  const isFocusedEdit = focusedEdit != null;
  const isActionBusy = actionBusy !== null;

  useEffect(() => {
    if (!isOpen || !focusedEdit?.id) return;
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;

      if (focusedEdit.kind === "activity") {
        const w = workouts.find((row) => row.id === focusedEdit.id);
        if (!w) return;
        setTab("activity");
        setWorkoutForm({
          workoutType: w.workoutType,
          date: toLocalDateInput(w.startedAt),
          startTime: toLocalTimeInput(w.startedAt),
          endTime: w.endedAt ? toLocalTimeInput(w.endedAt) : "",
          distanceMiles: metersToMiles(w.distanceMeters),
          pace: w.pace ?? "",
          notes: w.notes ?? "",
        });
      }

      if (focusedEdit.kind === "food") {
        const f = foods.find((row) => row.id === focusedEdit.id);
        if (!f) return;
        setTab("food");
        setFoodForm({
          date: utcIsoToZonedDateInput(f.eatenAt, effectiveTz),
          time: utcIsoToZonedTimeInput(f.eatenAt, effectiveTz),
          title: f.title,
          carbsGrams: f.carbsGrams != null ? String(f.carbsGrams) : "",
          foodTypeTag: parseFoodTypeTag(f.notes),
        });
      }

      if (focusedEdit.kind === "sleep") {
        const s = sleeps.find((row) => row.id === focusedEdit.id);
        if (!s) return;
        const recur = parseSleepRecurrenceMeta(s.notes);
        setTab("sleep");
        setSleepForm({
          bedDate: toLocalDateInput(s.sleepStart),
          bedTime: toLocalTimeInput(s.sleepStart),
          wakeDate: toLocalDateInput(s.sleepEnd),
          wakeTime: toLocalTimeInput(s.sleepEnd),
          recurring: recur != null,
          recurrenceFreq: recur?.freq ?? "weekly",
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, focusedEdit, workouts, foods, sleeps, effectiveTz]);

  async function createSleep() {
    setError(null);
    setActionBusy("create-sleep");
    try {
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
      showSuccessToast("Sleep saved");
    } finally {
      setActionBusy(null);
    }
  }

  async function saveSleep(item: SleepRow) {
    setActionBusy("save-sleep");
    try {
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
      showSuccessToast("Sleep updated");
    } finally {
      setActionBusy(null);
    }
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
    setActionBusy("delete-sleep");
    try {
      await fetch(url, { method: "DELETE" });
      await loadAll();
      notifyDayDataChanged();
      showSuccessToast("Sleep deleted");
    } finally {
      setActionBusy(null);
    }
  }

  async function createWorkout() {
    setError(null);
    setActionBusy("create-activity");
    try {
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
      showSuccessToast("Activity saved");
      setIsOpen(false);
      setFocusedEdit(null);
    } finally {
      setActionBusy(null);
    }
  }

  async function createFood() {
    setError(null);
    setActionBusy("create-food");
    try {
      const resp = await fetch("/api/manual/food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: foodForm.title.trim() || "Meal",
          eatenAt: zonedDateTimeToUtcIso(foodForm.date, foodForm.time, effectiveTz),
          carbsGrams: foodForm.carbsGrams ? Number(foodForm.carbsGrams) : null,
          notes: toFoodTypeNote(foodForm.foodTypeTag),
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
        foodTypeTag: null,
      });
      await loadAll();
      notifyDayDataChanged();
      showSuccessToast("Food saved");
    } finally {
      setActionBusy(null);
    }
  }

  async function saveWorkout(item: Workout) {
    setActionBusy("save-activity");
    try {
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
      showSuccessToast("Activity updated");
      setIsOpen(false);
      setFocusedEdit(null);
    } finally {
      setActionBusy(null);
    }
  }

  async function saveFood(item: FoodEntry) {
    setActionBusy("save-food");
    try {
      const resp = await fetch(`/api/manual/food/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.title,
          eatenAt: item.eatenAt,
          carbsGrams: item.carbsGrams,
          notes: item.notes,
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
      showSuccessToast("Food updated");
    } finally {
      setActionBusy(null);
    }
  }

  async function deleteWorkout(id: string) {
    setActionBusy("delete-activity");
    try {
      await fetch(`/api/manual/workouts/${id}`, { method: "DELETE" });
      await loadAll();
      notifyDayDataChanged();
      showSuccessToast("Activity deleted");
    } finally {
      setActionBusy(null);
    }
  }

  async function deleteFood(id: string) {
    setActionBusy("delete-food");
    try {
      await fetch(`/api/manual/food/${id}`, { method: "DELETE" });
      await loadAll();
      notifyDayDataChanged();
      showSuccessToast("Food deleted");
    } finally {
      setActionBusy(null);
    }
  }

  const tabBtn = (active: boolean) =>
    [
      "inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold transition-all duration-200",
      active
        ? "border-align-forest bg-align-forest text-white shadow-sm shadow-black/10"
        : "border-align-border/90 bg-white text-zinc-600 shadow-sm shadow-black/[0.02] hover:border-align-border hover:bg-align-subtle hover:text-zinc-900",
    ].join(" ");

  const focusedEditTitle = useMemo(() => {
    if (!focusedEdit) return "Add / edit entries";
    if (focusedEdit.kind === "sleep") return "Edit Sleep";
    if (focusedEdit.kind === "activity") return "Edit Activity";
    if (focusedEdit.kind === "food") return "Edit Food";
    return "Edit";
  }, [focusedEdit]);

  const addTabHelperText = useMemo(() => {
    if (tab === "activity") {
      return "Log movement with optional distance, pace, and notes.";
    }
    if (tab === "sleep") {
      return "Track bedtime and wake time; set repeats if your schedule is regular.";
    }
    return "Capture meal timing and optional carbs to improve food-related insights.";
  }, [tab]);

  return (
    <>
      {toast ? <LightToast message={toast} /> : null}
      {showCard ? (
        <section className="w-full overflow-hidden rounded-2xl border border-align-border/90 bg-white/90 p-5 text-left shadow-sm ring-1 ring-black/[0.03]">
          <div className="flex flex-col gap-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
                Log your day
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                Sleep, movement, and food for{" "}
                <span className="font-semibold text-align-forest">{formatHeaderDate(resolvedDateYmd)}</span>
              </p>
            </div>
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
                    {focusedEditTitle}
                  </h3>
                  <p className="mt-0.5 text-sm font-medium text-align-muted">
                    {formatHeaderDate(resolvedDateYmd)}
                  </p>
                </div>
                <button
                  type="button"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-align-border/90 bg-align-subtle text-zinc-500 transition hover:border-align-border hover:bg-white hover:text-zinc-800"
                  onClick={() => {
                    setIsOpen(false);
                    setFocusedEdit(null);
                  }}
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

              {!isFocusedEdit ? (
              <div className="mt-5 space-y-2">
                <div className="flex gap-2">
                <button
                  type="button"
                  className={tabBtn(tab === "activity")}
                  onClick={() => setTab("activity")}
                >
                  🏃 Workout
                </button>
                <button
                  type="button"
                  className={tabBtn(tab === "sleep")}
                  onClick={() => setTab("sleep")}
                >
                  😴 Sleep
                </button>
                <button
                  type="button"
                  className={tabBtn(tab === "food")}
                  onClick={() => setTab("food")}
                >
                  🍽 Food
                </button>
              </div>
                <p className="text-xs text-zinc-500">{addTabHelperText}</p>
              </div>
              ) : null}

              {!isFocusedEdit ? (
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
                      className="w-full rounded-full bg-align-forest py-3 text-sm font-semibold text-white shadow-sm shadow-black/10 transition hover:bg-align-forest-muted active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-align-forest"
                      disabled={isActionBusy}
                      onClick={() => void createSleep()}
                    >
                      {actionBusy === "create-sleep" ? "Saving…" : "Save sleep"}
                    </button>
                  </>
                ) : null}

                {tab === "activity" ? (
                  <>
                    <div className="space-y-2">
                      <FieldLabel>Type</FieldLabel>
                      <select
                        className={inputClass()}
                        value={workoutForm.workoutType}
                        onChange={(e) =>
                          setWorkoutForm((s) => ({ ...s, workoutType: e.target.value }))
                        }
                      >
                        {WORKOUT_TYPES.map((t) => (
                          <option key={t.key} value={t.key}>
                            {t.emoji} {t.label}
                          </option>
                        ))}
                      </select>
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
                      className="w-full rounded-full bg-align-forest py-3 text-sm font-semibold text-white shadow-sm shadow-black/10 transition hover:bg-align-forest-muted active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-align-forest"
                      disabled={isActionBusy}
                      onClick={() => void createWorkout()}
                    >
                      {actionBusy === "create-activity" ? "Saving…" : "Save activity"}
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
                      <p className="text-xs leading-relaxed text-amber-950/90">
                        <span className="font-semibold">Looks like {foodFormMealPreview.label}</span>
                        <span className="font-normal text-zinc-600">
                          {" "}
                          — logged using your day timezone (Settings).
                        </span>
                      </p>
                      <button
                        type="button"
                        className="text-xs font-medium text-align-forest underline underline-offset-2 hover:text-align-forest-muted"
                        onClick={() =>
                          setFoodForm((s) => ({
                            ...s,
                            time: suggestedTimeForMealPeriod(foodFormMealPreview.period),
                          }))
                        }
                      >
                        Use {foodFormMealPreview.label.toLowerCase()} time
                      </button>
                    </div>
                    <div className="rounded-2xl border border-dashed border-align-border/90 bg-align-subtle/40 p-4">
                      <FieldLabel>Type (optional)</FieldLabel>
                      <p className="mb-3 text-xs text-zinc-500">
                        Typical glucose curve length as a hint, not medical advice.
                      </p>
                      <select
                        className={inputClass()}
                        value={foodForm.foodTypeTag ?? ""}
                        onChange={(e) => {
                          const nextTag = (e.target.value || null) as FoodTypeTag | null;
                          const preset = FOOD_PRESETS.find((p) => p.typeTag === nextTag);
                          setFoodForm((s) => ({
                            ...s,
                            foodTypeTag: nextTag,
                            carbsGrams: preset?.carbsHint ?? s.carbsGrams,
                          }));
                        }}
                      >
                        <option value="">No type selected</option>
                        {FOOD_PRESETS.map((p) => (
                          <option key={p.typeTag} value={p.typeTag}>
                            {p.emoji} {p.title} ({p.hint})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel>Type tag (optional)</FieldLabel>
                      <div className="flex flex-wrap gap-2">
                        {foodForm.foodTypeTag ? (
                          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900">
                            {foodTypeTagLabel(foodForm.foodTypeTag)}
                            <button
                              type="button"
                              className="rounded-full px-1 text-emerald-700 hover:bg-emerald-100"
                              aria-label="Clear food type tag"
                              onClick={() =>
                                setFoodForm((s) => ({ ...s, foodTypeTag: null }))
                              }
                            >
                              ×
                            </button>
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-500">No type selected</span>
                        )}
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
                      className="w-full rounded-full bg-align-forest py-3 text-sm font-semibold text-white shadow-sm shadow-black/10 transition hover:bg-align-forest-muted active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-align-forest"
                      disabled={isActionBusy}
                      onClick={() => void createFood()}
                    >
                      {actionBusy === "create-food" ? "Saving…" : "Save food"}
                    </button>
                  </>
                ) : null}
              </div>
              ) : null}

              {isFocusedEdit ? (
                <div className="mt-4 space-y-3">
                  {focusedEdit?.kind === "sleep" && focusedEdit.id ? (
                    <div className="space-y-5 rounded-2xl border border-align-border/80 bg-white p-4 shadow-sm">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <FieldLabel>Bed date</FieldLabel>
                          <input
                            type="date"
                            className={inputClass(true)}
                            value={sleepForm.bedDate}
                            onChange={(e) => setSleepForm((s) => ({ ...s, bedDate: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <FieldLabel>Bed time</FieldLabel>
                          <input
                            type="time"
                            className={inputClass(true)}
                            value={sleepForm.bedTime}
                            onChange={(e) => setSleepForm((s) => ({ ...s, bedTime: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <FieldLabel>Wake date</FieldLabel>
                          <input
                            type="date"
                            className={inputClass(true)}
                            value={sleepForm.wakeDate}
                            onChange={(e) => setSleepForm((s) => ({ ...s, wakeDate: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <FieldLabel>Wake time</FieldLabel>
                          <input
                            type="time"
                            className={inputClass(true)}
                            value={sleepForm.wakeTime}
                            onChange={(e) => setSleepForm((s) => ({ ...s, wakeTime: e.target.value }))}
                          />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 rounded-full border border-align-border/80 bg-align-subtle/30 px-4 py-3 text-sm font-medium text-zinc-700">
                        <input
                          type="checkbox"
                          checked={sleepForm.recurring}
                          onChange={(e) => setSleepForm((s) => ({ ...s, recurring: e.target.checked }))}
                          className="h-4 w-4 rounded border-align-border text-align-forest"
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
                        </div>
                      ) : null}

                      <div className="mt-4 space-y-2">
                        <button
                          type="button"
                          className="w-full rounded-full bg-align-forest py-3 text-sm font-semibold text-white shadow-sm shadow-black/10 transition hover:bg-align-forest-muted active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-align-forest"
                          disabled={isActionBusy}
                          onClick={() => {
                            const existing = sleeps.find((r) => r.id === focusedEdit.id);
                            if (!existing) return;
                            const sleepStart = toIsoFromDateTime(sleepForm.bedDate, sleepForm.bedTime);
                            const sleepEnd = toIsoFromDateTime(sleepForm.wakeDate, sleepForm.wakeTime);
                            const prev = parseSleepRecurrenceMeta(existing.notes);
                            const seriesId =
                              prev?.seriesId ??
                              globalThis.crypto?.randomUUID?.() ??
                              `series_${existing.id}`;
                            const notes = sleepForm.recurring
                              ? buildSleepRecurrenceNotes({
                                  v: 1,
                                  seriesId,
                                  freq: sleepForm.recurrenceFreq,
                                  anchorSleepStartIso: prev?.anchorSleepStartIso ?? sleepStart,
                                })
                              : null;
                            void saveSleep({ ...existing, sleepStart, sleepEnd, notes });
                          }}
                        >
                          {actionBusy === "save-sleep" ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          className="w-full rounded-full border border-red-200 bg-white py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white"
                          disabled={isActionBusy}
                          onClick={() => {
                            const existing = sleeps.find((r) => r.id === focusedEdit.id);
                            if (!existing) return;
                            void deleteSleep(existing);
                          }}
                        >
                          {actionBusy === "delete-sleep" ? "Deleting…" : "Delete sleep entry"}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {focusedEdit?.kind === "activity" && focusedEdit.id ? (
                    <div className="space-y-5 rounded-2xl border border-align-border/80 bg-white p-4 shadow-sm">
                      <div className="space-y-2">
                        <FieldLabel>Type</FieldLabel>
                        <select
                          className={inputClass()}
                          value={workoutForm.workoutType}
                          onChange={(e) =>
                            setWorkoutForm((s) => ({ ...s, workoutType: e.target.value }))
                          }
                        >
                          {WORKOUT_TYPES.map((t) => (
                            <option key={t.key} value={t.key}>
                              {t.emoji} {t.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <FieldLabel>Start</FieldLabel>
                          <input
                            type="time"
                            className={inputClass(true)}
                            value={workoutForm.startTime}
                            onChange={(e) => setWorkoutForm((s) => ({ ...s, startTime: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <FieldLabel>End</FieldLabel>
                          <input
                            type="time"
                            className={inputClass(true)}
                            value={workoutForm.endTime}
                            onChange={(e) => setWorkoutForm((s) => ({ ...s, endTime: e.target.value }))}
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
                          onChange={(e) => setWorkoutForm((s) => ({ ...s, distanceMiles: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <FieldLabel>Pace (optional, auto)</FieldLabel>
                        <input
                          type="text"
                          className={inputClass()}
                          placeholder="—"
                          value={workoutForm.pace}
                          onChange={(e) => setWorkoutForm((s) => ({ ...s, pace: e.target.value }))}
                        />
                        {computedPace && !workoutForm.pace.trim() ? (
                          <p className="text-xs text-align-forest-muted">
                            Suggested from time & distance:{" "}
                            <span className="font-mono font-medium">{computedPace}</span>
                          </p>
                        ) : null}
                      </div>
                      <div className="space-y-1.5">
                        <FieldLabel>Notes (optional)</FieldLabel>
                        <input
                          type="text"
                          className={inputClass()}
                          value={workoutForm.notes}
                          onChange={(e) => setWorkoutForm((s) => ({ ...s, notes: e.target.value }))}
                          placeholder="Anything notable?"
                        />
                      </div>
                      <div className="mt-4 space-y-2">
                        <button
                          type="button"
                          className="w-full rounded-full bg-align-forest py-3 text-sm font-semibold text-white shadow-sm shadow-black/10 transition hover:bg-align-forest-muted active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-align-forest"
                          disabled={isActionBusy}
                          onClick={() => {
                            const existing = workouts.find((r) => r.id === focusedEdit.id);
                            if (!existing) return;
                            const miles = workoutForm.distanceMiles ? Number(workoutForm.distanceMiles) : null;
                            const pace =
                              workoutForm.pace.trim() ||
                              (computedPace && computedPace !== "" ? computedPace : null);
                            void saveWorkout({
                              ...existing,
                              workoutType: workoutForm.workoutType,
                              startedAt: toIsoFromDateTime(workoutForm.date, workoutForm.startTime),
                              endedAt: workoutForm.endTime
                                ? toIsoFromDateTime(workoutForm.date, workoutForm.endTime)
                                : null,
                              distanceMeters:
                                miles != null && !Number.isNaN(miles) ? Math.round(miles * METERS_PER_MILE) : null,
                              pace: pace && pace !== "" ? pace : null,
                              notes: workoutForm.notes || null,
                            });
                          }}
                        >
                          {actionBusy === "save-activity" ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          className="w-full rounded-full border border-red-200 bg-white py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white"
                          disabled={isActionBusy}
                          onClick={() => void deleteWorkout(focusedEdit.id)}
                        >
                          {actionBusy === "delete-activity" ? "Deleting…" : "Delete activity"}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {focusedEdit?.kind === "food" && focusedEdit.id ? (
                    <div className="space-y-5 rounded-2xl border border-align-border/80 bg-white p-4 shadow-sm">
                      <div className="space-y-1.5">
                        <FieldLabel>Time (first bite)</FieldLabel>
                        <input
                          type="time"
                          className={inputClass(true)}
                          value={foodForm.time}
                          onChange={(e) => setFoodForm((s) => ({ ...s, time: e.target.value }))}
                        />
                        <p className="text-xs leading-relaxed text-amber-950/90">
                          <span className="font-semibold">Looks like {foodFormMealPreview.label}</span>
                          <span className="font-normal text-zinc-600">
                            {" "}
                            — logged using your day timezone (Settings).
                          </span>
                        </p>
                        <button
                          type="button"
                          className="text-xs font-medium text-align-forest underline underline-offset-2 hover:text-align-forest-muted"
                          onClick={() =>
                            setFoodForm((s) => ({
                              ...s,
                              time: suggestedTimeForMealPeriod(foodFormMealPreview.period),
                            }))
                          }
                        >
                          Use {foodFormMealPreview.label.toLowerCase()} time
                        </button>
                      </div>
                      <div className="rounded-2xl border border-dashed border-align-border/90 bg-align-subtle/40 p-4">
                        <FieldLabel>Type (optional)</FieldLabel>
                        <p className="mb-3 text-xs text-zinc-500">
                          Typical glucose curve length as a hint, not medical advice.
                        </p>
                        <select
                          className={inputClass()}
                          value={foodForm.foodTypeTag ?? ""}
                          onChange={(e) => {
                            const nextTag = (e.target.value || null) as FoodTypeTag | null;
                            const preset = FOOD_PRESETS.find((p) => p.typeTag === nextTag);
                            setFoodForm((s) => ({
                              ...s,
                              foodTypeTag: nextTag,
                              carbsGrams: preset?.carbsHint ?? s.carbsGrams,
                            }));
                          }}
                        >
                          <option value="">No type selected</option>
                          {FOOD_PRESETS.map((p) => (
                            <option key={p.typeTag} value={p.typeTag}>
                              {p.emoji} {p.title} ({p.hint})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <FieldLabel>Type tag (optional)</FieldLabel>
                        <div className="flex flex-wrap gap-2">
                          {foodForm.foodTypeTag ? (
                            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900">
                              {foodTypeTagLabel(foodForm.foodTypeTag)}
                              <button
                                type="button"
                                className="rounded-full px-1 text-emerald-700 hover:bg-emerald-100"
                                aria-label="Clear food type tag"
                                onClick={() =>
                                  setFoodForm((s) => ({ ...s, foodTypeTag: null }))
                                }
                              >
                                ×
                              </button>
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-500">No type selected</span>
                          )}
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
                          onChange={(e) => setFoodForm((s) => ({ ...s, carbsGrams: e.target.value }))}
                        />
                      </div>
                      <div className="mt-4 space-y-2">
                        <button
                          type="button"
                          className="w-full rounded-full bg-align-forest py-3 text-sm font-semibold text-white shadow-sm shadow-black/10 transition hover:bg-align-forest-muted active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-align-forest"
                          disabled={isActionBusy}
                          onClick={() => {
                            const existing = foods.find((r) => r.id === focusedEdit.id);
                            if (!existing) return;
                            void saveFood({
                              ...existing,
                              title: foodForm.title,
                              eatenAt: zonedDateTimeToUtcIso(foodForm.date, foodForm.time, effectiveTz),
                              carbsGrams: foodForm.carbsGrams ? Number(foodForm.carbsGrams) : null,
                              notes: toFoodTypeNote(foodForm.foodTypeTag),
                            });
                          }}
                        >
                          {actionBusy === "save-food" ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          className="w-full rounded-full border border-red-200 bg-white py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white"
                          disabled={isActionBusy}
                          onClick={() => void deleteFood(focusedEdit.id)}
                        >
                          {actionBusy === "delete-food" ? "Deleting…" : "Delete food entry"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {false ? <div className="my-6 h-px bg-align-border-soft" /> : null}

              {false ? <div className="space-y-3">
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
                                value={utcIsoToZonedDateInput(f.eatenAt, effectiveTz)}
                                onChange={(e) =>
                                  setFoods((rows) =>
                                    rows.map((r) =>
                                      r.id === f.id
                                        ? {
                                            ...r,
                                            eatenAt: zonedDateTimeToUtcIso(
                                              e.target.value,
                                              utcIsoToZonedTimeInput(r.eatenAt, effectiveTz),
                                              effectiveTz,
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
                                value={utcIsoToZonedTimeInput(f.eatenAt, effectiveTz)}
                                onChange={(e) =>
                                  setFoods((rows) =>
                                    rows.map((r) =>
                                      r.id === f.id
                                        ? {
                                            ...r,
                                            eatenAt: zonedDateTimeToUtcIso(
                                              utcIsoToZonedDateInput(r.eatenAt, effectiveTz),
                                              e.target.value,
                                              effectiveTz,
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
                                <p
                                  className="text-xs text-zinc-500"
                                  title="Smart guess from the meal time (uses your day timezone setting)"
                                >
                                  {inferMealPeriodFromLocalTime(f.eatenAt, effectiveTz).label}
                                  {" · "}
                                  {formatInTimeZone(
                                    new Date(f.eatenAt),
                                    effectiveTz,
                                    "MMM d, yyyy · h:mm a",
                                  )}
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
              </div> : null}

              {/* Close via the X in the header; save/delete live in each editor. */}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
