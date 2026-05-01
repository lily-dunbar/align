"use client";

import { useEffect, useMemo, useState } from "react";

import { DAY_DATA_CHANGED_EVENT, OPEN_MANUAL_MODAL_EVENT } from "@/lib/day-view-events";

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

type Props = {
  dateYmd: string;
  /** When false, only the modal is rendered (no outer card). Default true. */
  showCard?: boolean;
};

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
  return (
    d.getFullYear() === y &&
    d.getMonth() + 1 === m &&
    d.getDate() === day
  );
}

function notifyDayDataChanged() {
  window.dispatchEvent(new CustomEvent(DAY_DATA_CHANGED_EVENT));
}

export function ManualEntryPanel({ dateYmd, showCard = true }: Props) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [foods, setFoods] = useState<FoodEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<"activity" | "food">("activity");

  const [workoutForm, setWorkoutForm] = useState({
    workoutType: "Walk",
    date: dateYmd,
    startTime: "12:00",
    endTime: "",
    distanceMeters: "",
    pace: "",
    notes: "",
  });
  const [foodForm, setFoodForm] = useState({
    date: dateYmd,
    time: "12:00",
    carbsGrams: "",
  });

  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [wResp, fResp] = await Promise.all([
        fetch("/api/manual/workouts", { cache: "no-store" }),
        fetch("/api/manual/food", { cache: "no-store" }),
      ]);
      const wJson = (await wResp.json()) as { items?: Workout[]; error?: string };
      const fJson = (await fResp.json()) as { items?: FoodEntry[]; error?: string };
      if (!wResp.ok) throw new Error(wJson.error ?? "Failed to load workouts");
      if (!fResp.ok) throw new Error(fJson.error ?? "Failed to load food");
      setWorkouts(wJson.items ?? []);
      setFoods(fJson.items ?? []);
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
        const [wResp, fResp] = await Promise.all([
          fetch("/api/manual/workouts", { cache: "no-store" }),
          fetch("/api/manual/food", { cache: "no-store" }),
        ]);
        const wJson = (await wResp.json()) as { items?: Workout[]; error?: string };
        const fJson = (await fResp.json()) as { items?: FoodEntry[]; error?: string };
        if (!wResp.ok) throw new Error(wJson.error ?? "Failed to load workouts");
        if (!fResp.ok) throw new Error(fJson.error ?? "Failed to load food");
        if (!cancelled) {
          setWorkouts(wJson.items ?? []);
          setFoods(fJson.items ?? []);
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
      setWorkoutForm((s) => ({ ...s, date: dateYmd }));
      setFoodForm((s) => ({ ...s, date: dateYmd }));
      setIsOpen(true);
    }
    window.addEventListener(OPEN_MANUAL_MODAL_EVENT, handleOpen);
    return () => {
      window.removeEventListener(OPEN_MANUAL_MODAL_EVENT, handleOpen);
    };
  }, [dateYmd]);

  const workoutsForDate = useMemo(
    () => workouts.filter((w) => isSameLocalDay(w.startedAt, dateYmd)),
    [workouts, dateYmd],
  );

  const foodForDate = useMemo(
    () => foods.filter((f) => isSameLocalDay(f.eatenAt, dateYmd)),
    [foods, dateYmd],
  );

  async function createWorkout() {
    setError(null);
    const resp = await fetch("/api/manual/workouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workoutType: workoutForm.workoutType,
        startedAt: toIsoFromDateTime(workoutForm.date, workoutForm.startTime),
        endedAt: workoutForm.endTime
          ? toIsoFromDateTime(workoutForm.date, workoutForm.endTime)
          : null,
        distanceMeters: workoutForm.distanceMeters
          ? Number(workoutForm.distanceMeters)
          : null,
        pace: workoutForm.pace || null,
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
      date: dateYmd,
      startTime: "12:00",
      endTime: "",
      distanceMeters: "",
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
      date: dateYmd,
      time: "12:00",
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

  return (
    <>
      {showCard ? (
    <section className="w-full rounded-2xl border border-zinc-200 bg-white p-5 text-left shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Add activity</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Log workouts, walks, and meals for{" "}
            <span className="font-medium text-zinc-800">{dateYmd}</span>.
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
          disabled={loading}
          onClick={() => {
            setTab("activity");
            setWorkoutForm((s) => ({ ...s, date: dateYmd }));
            setFoodForm((s) => ({ ...s, date: dateYmd }));
            setIsOpen(true);
          }}
        >
          Add activity
        </button>
      </div>
      <p className="mt-3 text-sm text-zinc-600">
        {loading
          ? "Loading entries…"
          : `${workoutsForDate.length} activit${workoutsForDate.length === 1 ? "y" : "ies"} · ${foodForDate.length} food entr${foodForDate.length === 1 ? "y" : "ies"}`}
      </p>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </section>
      ) : null}

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px]">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl">
            {!showCard && error ? (
              <p className="mb-2 text-sm text-red-600">{error}</p>
            ) : null}
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold tracking-tight">Add/Edit Entries</h3>
              <button
                className="rounded-lg border border-zinc-300 px-2 py-1 text-sm"
                onClick={() => setIsOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mb-4 flex gap-2">
              <button
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  tab === "activity"
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 bg-white"
                }`}
                onClick={() => setTab("activity")}
              >
                Activity
              </button>
              <button
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  tab === "food"
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 bg-white"
                }`}
                onClick={() => setTab("food")}
              >
                Food
              </button>
            </div>

            {tab === "activity" ? (
              <div>
                <div className="grid gap-2">
                  <select
                    className="rounded-lg border border-zinc-300 px-2 py-1 text-sm"
                    value={workoutForm.workoutType}
                    onChange={(e) => setWorkoutForm((s) => ({ ...s, workoutType: e.target.value }))}
                  >
                    <option>Walk</option>
                    <option>Run</option>
                    <option>Bike</option>
                    <option>Swim</option>
                  </select>
                  <input
                    className="rounded-lg border border-zinc-300 px-2 py-1 text-sm"
                    type="date"
                    value={workoutForm.date}
                    onChange={(e) => setWorkoutForm((s) => ({ ...s, date: e.target.value }))}
                  />
                  <input
                    className="rounded-lg border border-zinc-300 px-2 py-1 text-sm"
                    type="time"
                    value={workoutForm.startTime}
                    onChange={(e) => setWorkoutForm((s) => ({ ...s, startTime: e.target.value }))}
                  />
                  <input
                    className="rounded-lg border border-zinc-300 px-2 py-1 text-sm"
                    type="time"
                    value={workoutForm.endTime}
                    onChange={(e) => setWorkoutForm((s) => ({ ...s, endTime: e.target.value }))}
                  />
                  <input
                    className="rounded-lg border border-zinc-300 px-2 py-1 text-sm"
                    type="number"
                    min="0"
                    placeholder="Distance (meters)"
                    value={workoutForm.distanceMeters}
                    onChange={(e) =>
                      setWorkoutForm((s) => ({ ...s, distanceMeters: e.target.value }))
                    }
                  />
                  <input
                    className="rounded-lg border border-zinc-300 px-2 py-1 text-sm"
                    placeholder="Pace (e.g., 8:45 /mi)"
                    value={workoutForm.pace}
                    onChange={(e) => setWorkoutForm((s) => ({ ...s, pace: e.target.value }))}
                  />
                  <input
                    className="rounded-lg border border-zinc-300 px-2 py-1 text-sm"
                    placeholder="Notes"
                    value={workoutForm.notes}
                    onChange={(e) => setWorkoutForm((s) => ({ ...s, notes: e.target.value }))}
                  />
                  <button
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
                    onClick={() => void createWorkout()}
                  >
                    Save activity
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {workoutsForDate.map((w) => {
                    const editing = editingWorkoutId === w.id;
                    return (
                      <div key={w.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-sm">
                        {editing ? (
                          <div className="grid gap-2">
                            <select
                              className="rounded-lg border border-zinc-300 px-2 py-1"
                              value={w.workoutType}
                              onChange={(e) =>
                                setWorkouts((rows) =>
                                  rows.map((r) =>
                                    r.id === w.id ? { ...r, workoutType: e.target.value } : r,
                                  ),
                                )
                              }
                            >
                              <option>Walk</option>
                              <option>Run</option>
                              <option>Bike</option>
                              <option>Swim</option>
                            </select>
                            <input
                              className="rounded-lg border border-zinc-300 px-2 py-1"
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
                              className="rounded-lg border border-zinc-300 px-2 py-1"
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
                              className="rounded-lg border border-zinc-300 px-2 py-1"
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
                              className="rounded-lg border border-zinc-300 px-2 py-1"
                              type="number"
                              min="0"
                              placeholder="Distance (meters)"
                              value={w.distanceMeters ?? ""}
                              onChange={(e) =>
                                setWorkouts((rows) =>
                                  rows.map((r) =>
                                    r.id === w.id
                                      ? {
                                          ...r,
                                          distanceMeters: e.target.value
                                            ? Number(e.target.value)
                                            : null,
                                        }
                                      : r,
                                  ),
                                )
                              }
                            />
                            <input
                              className="rounded-lg border border-zinc-300 px-2 py-1"
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
                              className="rounded-lg border border-zinc-300 px-2 py-1"
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
                                className="rounded-lg border border-zinc-300 px-2 py-1"
                                onClick={() => void saveWorkout(w)}
                              >
                                Save
                              </button>
                              <button
                                className="rounded-lg border border-zinc-300 px-2 py-1"
                                onClick={() => setEditingWorkoutId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="font-medium">{w.workoutType}</p>
                              <p className="text-xs text-zinc-500">
                                {new Date(w.startedAt).toLocaleString()}
                              </p>
                              <p className="text-xs text-zinc-500">
                                {w.distanceMeters ? `${w.distanceMeters} m` : "No distance"}
                                {w.pace ? ` · ${w.pace}` : ""}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                className="rounded-lg border border-zinc-300 px-2 py-1 text-xs"
                                onClick={() => setEditingWorkoutId(w.id)}
                              >
                                Edit
                              </button>
                              <button
                                className="rounded-lg border border-zinc-300 px-2 py-1 text-xs"
                                onClick={() => void deleteWorkout(w.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div>
                <div className="grid gap-2">
                  <input
                    className="rounded-lg border border-zinc-300 px-2 py-1 text-sm"
                    type="date"
                    value={foodForm.date}
                    onChange={(e) => setFoodForm((s) => ({ ...s, date: e.target.value }))}
                  />
                  <input
                    className="rounded-lg border border-zinc-300 px-2 py-1 text-sm"
                    type="time"
                    value={foodForm.time}
                    onChange={(e) => setFoodForm((s) => ({ ...s, time: e.target.value }))}
                  />
                  <input
                    className="rounded-lg border border-zinc-300 px-2 py-1 text-sm"
                    type="number"
                    min="0"
                    placeholder="Carbs (g)"
                    value={foodForm.carbsGrams}
                    onChange={(e) => setFoodForm((s) => ({ ...s, carbsGrams: e.target.value }))}
                  />
                  <button
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
                    onClick={() => void createFood()}
                  >
                    Save food
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {foodForDate.map((f) => {
                    const editing = editingFoodId === f.id;
                    return (
                      <div key={f.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-sm">
                        {editing ? (
                          <div className="grid gap-2">
                            <input
                              className="rounded-lg border border-zinc-300 px-2 py-1"
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
                              className="rounded-lg border border-zinc-300 px-2 py-1"
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
                              className="rounded-lg border border-zinc-300 px-2 py-1"
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
                                className="rounded-lg border border-zinc-300 px-2 py-1"
                                onClick={() => void saveFood(f)}
                              >
                                Save
                              </button>
                              <button
                                className="rounded-lg border border-zinc-300 px-2 py-1"
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
                                {f.carbsGrams != null ? `${f.carbsGrams} g carbs` : "Food entry"}
                              </p>
                              <p className="text-xs text-zinc-500">
                                {new Date(f.eatenAt).toLocaleString()}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                className="rounded-lg border border-zinc-300 px-2 py-1 text-xs"
                                onClick={() => setEditingFoodId(f.id)}
                              >
                                Edit
                              </button>
                              <button
                                className="rounded-lg border border-zinc-300 px-2 py-1 text-xs"
                                onClick={() => void deleteFood(f.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
