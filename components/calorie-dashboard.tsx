"use client";

import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { FiCheckCircle, FiClock, FiHeart } from 'react-icons/fi';
import type { DailyLog, DailyInsight, TopPick } from "@/lib/types";
import {
  getTopPicksForTimeSlot,
  saveFoodToDB,
  updateFoodFavourite,
  addPendingLog,
  deleteLog,
  syncDayWithGemini,
  getFavouriteFoodsByNames,
} from "@/app/actions";

type Props = {
  initialLogs: DailyLog[];
  initialInsight?: DailyInsight | null;
  canPersist: boolean;
  initialSelectedDate: string;
  initialTimeOfDay: string;
  initialTodayKey: string;
};

function getLocalDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA").format(date);
}

function formatDateKeyLabel(dateKey: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${dateKey}T12:00:00`));
}

function determineTimeSlot(date: Date) {
  const h = date.getHours();
  if (h >= 5 && h <= 10) return "morning";
  if (h >= 11 && h <= 14) return "afternoon";
  if (h >= 15 && h <= 20) return "evening";
  return "night";
}

function slotToHour(slot: string) {
  switch (slot) {
    case 'morning':
      return 8;
    case 'afternoon':
      return 13;
    case 'evening':
      return 18;
    case 'night':
    default:
      return 21;
  }
}

function buildTimestampForSlot(dateKey: string, slot: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setHours(slotToHour(slot), 0, 0, 0);
  return date.toISOString();
}

function labelTimeSlot(slot: string) {
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}

function getLogMealSlot(log: DailyLog) {
  return log.meal_slot ?? determineTimeSlot(new Date(log.logged_at));
}

function formatMacro(value: number) {
  return `${Math.round(value)}g`;
}

const surfaceInputClass =
  'rounded-full border border-white/10 bg-white/8 px-4 py-2 text-white placeholder:text-slate-400 shadow-inner outline-none transition focus:border-cyan-200/40 focus:bg-white/12';

const pastelButtonClass =
  'rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-white/16 focus:outline-none focus:ring-2 focus:ring-cyan-200/30';

const syncButtonClass =
  'rounded-full border border-cyan-200/20 bg-gradient-to-r from-cyan-200/20 to-emerald-200/20 px-4 py-2 text-white ring-1 ring-inset ring-cyan-100/20 transition hover:from-cyan-200/28 hover:to-emerald-200/28 disabled:cursor-not-allowed disabled:opacity-50';

const pastelChipClass =
  'rounded-full border border-emerald-200/25 bg-emerald-100/10 px-3 py-1 text-emerald-50 transition hover:bg-emerald-100/20';

const pastelAddButtonClass =
  'rounded-full border border-violet-200/20 bg-violet-100/12 px-4 py-2 text-violet-50 ring-1 ring-inset ring-violet-200/20 transition hover:bg-violet-100/20';

const pastelDeleteButtonClass =
  'rounded-full border border-white/12 bg-white/8 px-3 py-1 text-sm text-white transition hover:bg-white/15';

const pastelHeartButtonClass =
  'rounded-full border border-rose-200/20 bg-rose-100/10 px-2 py-1 text-rose-100 transition hover:bg-rose-100/20 disabled:opacity-60';

const mealTagClass =
  'inline-flex items-center rounded-full border border-sky-200/15 bg-sky-100/10 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-sky-50';

export function CalorieDashboard({
  initialLogs,
  initialInsight = null,
  canPersist,
  initialSelectedDate,
  initialTimeOfDay,
  initialTodayKey,
}: Props) {
  const [logs, setLogs] = useState<DailyLog[]>(() => {
    const arr = (initialLogs ?? []).map((l) => ({
      ...l,
      meal_slot: l.meal_slot ?? determineTimeSlot(new Date(l.logged_at)),
    }));
    return arr;
  });
  const [insight, setInsight] = useState<DailyInsight | null>(initialInsight ?? null);
  const [selectedDate, setSelectedDate] = useState(() => initialSelectedDate);
  const [followToday, setFollowToday] = useState(true);
  const [foodTitle, setFoodTitle] = useState("");
  const [recipeInput, setRecipeInput] = useState("");
  const [topPicks, setTopPicks] = useState<TopPick[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [timeOfDay, setTimeOfDay] = useState(() => initialTimeOfDay);
  const [heartedLogs, setHeartedLogs] = useState<Record<string, boolean>>({});
  const todayKey = initialTodayKey;

  useEffect(() => {
    // Initialize hearted state from persisted `foods.is_favourite`
    const resolvedNames = Array.from(new Set(logs.filter((l) => l.status === 'resolved').map((l) => l.display_name)));
    if (resolvedNames.length === 0) return;

    let mounted = true;
    (async () => {
      try {
        const favs = await getFavouriteFoodsByNames(resolvedNames);
        if (!mounted) return;
        if (!favs || favs.length === 0) return;
        setHeartedLogs((current) => {
          const next = { ...current };
          logs.forEach((l) => {
            if (l.status === 'resolved' && favs.includes(l.display_name)) next[l.id] = true;
          });
          return next;
        });
      } catch (err) {
        console.error('Failed to load favourites', err);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [logs]);

  useEffect(() => {
    if (!followToday) return;
    const tick = () => setSelectedDate(getLocalDateKey(new Date()));
    tick();
    setTimeOfDay(determineTimeSlot(new Date()));
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0);
    const t = next.getTime() - now.getTime();
    const id = window.setTimeout(() => {
      tick();
      setTimeout(tick, t);
    }, t);
    return () => window.clearTimeout(id);
  }, [followToday]);

  useEffect(() => {
    getTopPicksForTimeSlot(timeOfDay as any).then((p) => setTopPicks(p || []));
  }, [timeOfDay, selectedDate]);

  const selectedDayLogs = useMemo(
    () => logs.filter((l) => new Date(l.logged_at).toLocaleDateString("en-CA") === selectedDate).sort((a, b) => Number(new Date(b.logged_at)) - Number(new Date(a.logged_at))),
    [logs, selectedDate],
  );

  const resolvedTotals = useMemo(() => {
    return selectedDayLogs.reduce(
      (acc, l) => {
        if (l.status === "resolved") {
          acc.calories += l.calories ?? 0;
          acc.protein += l.protein ?? 0;
          acc.carbs += l.carbs ?? 0;
          acc.fat += l.fat ?? 0;
        }
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );
  }, [selectedDayLogs]);

  const totalCalories = resolvedTotals.calories;
  const targetLow = 1900;
  const targetHigh = 2100;
  const targetLabel = `${targetLow}-${targetHigh} kcal`;
  const calorieProgress = Math.min((totalCalories / targetHigh) * 100, 100);

  const pendingCount = selectedDayLogs.filter((l) => l.status === "pending").length;

  async function handleAddPending(displayName: string, recipeDetails?: string | null) {
    const originalInput = displayName.trim();
    if (!originalInput) return;
    setPendingKey(displayName);
    const parsed = parseQuantityAndName(originalInput);
    const quantity = parsed.quantity ?? undefined;
    const normalizedRecipeDetails = recipeDetails === undefined ? recipeInput.trim() || null : recipeDetails;
    const timestamp = buildTimestampForSlot(selectedDate, timeOfDay);
    if (!canPersist) {
      const optimistic: DailyLog = {
        id: `local-${Date.now()}`,
        logged_at: timestamp,
        meal_slot: timeOfDay,
        raw_input: parsed.name ?? displayName,
        quantity: parsed.quantity ?? null,
        recipe_details: normalizedRecipeDetails,
        display_name: parsed.name ?? displayName,
        food_id: null,
        calories: null,
        protein: null,
        carbs: null,
        fat: null,
        status: "pending",
      } as unknown as DailyLog;
      setLogs((s) => [optimistic, ...s]);
      setRecipeInput("");
      setPendingKey(null);
      return;
    }
    const added = await addPendingLog({
      raw_input: parsed.name ?? displayName,
      display_name: parsed.name ?? displayName,
      recipe_details: normalizedRecipeDetails,
      timestamp,
      meal_slot: timeOfDay,
      quantity,
    });
    if (added) {
      const normalized = { ...added, meal_slot: added.meal_slot ?? determineTimeSlot(new Date(added.logged_at)) } as DailyLog;
      setLogs((s) => [normalized, ...s]);
    } else {
        console.error('Failed to add pending log for', displayName);
      // show a simple alert so the user sees the failure in the browser
      try {
        // eslint-disable-next-line no-alert
        alert('Failed to add entry. Check server logs for details.');
      } catch (e) {
        // ignore in non-browser contexts
      }
    }
    setRecipeInput("");
    setPendingKey(null);
  }

  async function handleAddAndSync() {
    const title = foodTitle.trim();
    if (!title) return;

    setSyncError(null);
    setSyncMessage(null);
    await handleAddPending(title, recipeInput.trim() || null);
    setFoodTitle("");

    if (!canPersist) return;

    setIsSyncing(true);
    try {
      const res = await syncDayWithGemini(selectedDate, timeOfDay);
      setLogs((current) => {
        const other = current.filter((l) => new Date(l.logged_at).toLocaleDateString("en-CA") !== selectedDate);
        return [...(res.logs || []), ...other];
      });
      setInsight(res.insight ?? null);
      setSyncMessage('Saved and analysed with Gemini.');
    } catch (err: any) {
      console.error(err);
      setSyncError(err?.message || 'Gemini sync failed. Check the server logs and configuration.');
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleQuickAddAndSync(title: string) {
    setFoodTitle(title);
    await handleAddPending(title, recipeInput.trim() || null);

    if (!canPersist) return;

    setIsSyncing(true);
    try {
      const res = await syncDayWithGemini(selectedDate, timeOfDay);
      setLogs((current) => {
        const other = current.filter((l) => new Date(l.logged_at).toLocaleDateString("en-CA") !== selectedDate);
        return [...(res.logs || []), ...other];
      });
      setInsight(res.insight ?? null);
      setSyncMessage('Saved and analysed with Gemini.');
    } catch (err: any) {
      console.error(err);
      setSyncError(err?.message || 'Gemini sync failed. Check the server logs and configuration.');
    } finally {
      setIsSyncing(false);
    }
  }

  function parseQuantityAndName(input: string): { quantity?: string | null; name: string } {
    const trimmed = (input || '').trim();
    // match patterns like "3 boiled eggs", "2x boiled eggs", "1.5 cups oats"
    const re = /^\s*(\d+(?:[\.,]\d+)?)\s*(?:x|pcs|pieces|servings|serving|portion|portions|cup|cups)?\s+(.+)$/i;
    const m = re.exec(trimmed);
    if (m) {
      // normalize decimal comma to dot
      const qty = m[1].replace(',', '.');
      const name = m[2].trim();
      return { quantity: qty, name };
    }
    return { quantity: null, name: trimmed };
  }

  async function handleDelete(id: string) {
    setPendingKey(`del-${id}`);
    const ok = await deleteLog(id);
    if (ok) setLogs((s) => s.filter((l) => l.id !== id));
    setPendingKey(null);
  }

  async function handleHeart(log: DailyLog) {
    if (log.status !== 'resolved') return;
    setPendingKey(`heart-${log.id}`);
    const currently = heartedLogs[log.id];
    let ok = false;
    if (currently) {
      ok = await updateFoodFavourite(log.display_name, false);
      if (ok) setHeartedLogs((c) => ({ ...c, [log.id]: false }));
    } else {
      ok = await saveFoodToDB({
        name: log.display_name,
        calories: log.calories ?? 0,
        protein: log.protein ?? 0,
        carbs: log.carbs ?? 0,
        fat: log.fat ?? 0,
        unit: log.quantity ?? 'serving',
      });
      if (ok) setHeartedLogs((current) => ({ ...current, [log.id]: true }));
    }

    if (!ok) console.error('Heart toggle failed for', log.display_name);
    setPendingKey(null);
  }

  async function handleSync() {
    setIsSyncing(true);
    setSyncError(null);
    setSyncMessage(null);
    try {
      const res = await syncDayWithGemini(selectedDate, timeOfDay);
      setLogs((current) => {
        const other = current.filter((l) => new Date(l.logged_at).toLocaleDateString("en-CA") !== selectedDate);
        return [...(res.logs || []), ...other];
      });
      setInsight(res.insight ?? null);
      const resolvedCount = (res.logs || []).filter((log) => log.status === 'resolved').length;
      const pendingCount = (res.logs || []).filter((log) => log.status === 'pending').length;
      setSyncMessage(
        resolvedCount === 0 && pendingCount === 0
          ? 'Sync finished, but there were no entries to analyse for that day.'
          : `Synced ${resolvedCount + pendingCount} log${resolvedCount + pendingCount === 1 ? '' : 's'} for ${selectedDate}.`,
      );
    } catch (err: any) {
      console.error(err);
      setSyncError(err?.message || 'Sync failed. Check the server logs and Supabase/Gemini configuration.');
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-24 pt-4 sm:px-4 sm:pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-lg font-semibold">{selectedDate === todayKey ? "Today's log" : `${formatDateKeyLabel(selectedDate)} log`}</h2>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            aria-label="Select date"
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setFollowToday(false);
            }}
            className={surfaceInputClass}
          />
          <button className={`${syncButtonClass} w-full sm:w-auto`} disabled={isSyncing || selectedDayLogs.length === 0} onClick={handleSync}>
            {isSyncing ? "Syncing…" : "⚡ Sync & Analyse Day"}
          </button>
        </div>
        <div aria-live="polite" className="min-h-5 text-sm text-slate-300 sm:text-right">
          {syncMessage ? <span className="text-emerald-200">{syncMessage}</span> : null}
          {syncError ? <span className="text-rose-200">{syncError}</span> : null}
        </div>
      </div>

      <section className="mt-4">
        <div className="relative overflow-hidden rounded-[1.5rem] border border-sky-200/25 bg-gradient-to-br from-sky-300/18 via-slate-950 to-slate-900 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] lg:hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(186,230,253,0.16),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(167,243,208,0.12),transparent_28%)]" />
          <div className="relative">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[0.72rem] uppercase tracking-[0.28em] text-cyan-100/70">Today&apos;s calories</div>
                <div className="mt-2 text-3xl font-semibold tracking-tight text-white">{Math.round(totalCalories)} kcal</div>
                <div className="mt-2 text-sm text-cyan-100/80">Target window {targetLabel}</div>
              </div>
              <div className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-center text-xs text-slate-200">
                <div className="uppercase tracking-[0.22em] text-slate-400">Progress</div>
                <div className="mt-1 text-lg font-semibold text-white">{Math.round(calorieProgress)}%</div>
              </div>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-sky-300 to-emerald-300" style={{ width: `${calorieProgress}%` }} />
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/6 p-4">
              <div className="text-[0.72rem] uppercase tracking-[0.28em] text-slate-400">Macros from resolved items</div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  { label: 'P', value: resolvedTotals.protein, accent: 'from-emerald-400/25 to-emerald-300/5' },
                  { label: 'C', value: resolvedTotals.carbs, accent: 'from-amber-400/25 to-amber-300/5' },
                  { label: 'F', value: resolvedTotals.fat, accent: 'from-fuchsia-400/25 to-fuchsia-300/5' },
                ].map((macro) => (
                  <div key={macro.label} className={`rounded-2xl border border-white/10 bg-gradient-to-b ${macro.accent} px-3 py-3 text-center`}>
                    <div className="text-[0.68rem] uppercase tracking-[0.2em] text-slate-300">{macro.label}</div>
                    <div className="mt-1 text-lg font-semibold text-white">{Math.round(macro.value)}g</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="hidden lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:gap-3">
          <div className="relative overflow-hidden rounded-[1.5rem] border border-sky-200/25 bg-gradient-to-br from-sky-300/18 via-slate-950 to-slate-900 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(186,230,253,0.16),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(167,243,208,0.12),transparent_28%)]" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-[0.72rem] uppercase tracking-[0.28em] text-cyan-100/70">Today&apos;s calories</div>
                <div className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{Math.round(totalCalories)} kcal</div>
                <div className="mt-2 text-sm text-cyan-100/80">Target window {targetLabel}</div>
              </div>
              <div className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-center text-xs text-slate-200 sm:text-right">
                <div className="uppercase tracking-[0.22em] text-slate-400">Progress</div>
                <div className="mt-1 text-lg font-semibold text-white">{Math.round(calorieProgress)}%</div>
              </div>
            </div>
            <div className="relative mt-5 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-sky-300 to-emerald-300" style={{ width: `${calorieProgress}%` }} />
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-rose-200/20 bg-gradient-to-br from-rose-100/8 via-white/6 to-violet-100/8 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl">
            <div className="text-[0.72rem] uppercase tracking-[0.28em] text-slate-400">Macros from resolved items</div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { label: 'Protein', value: resolvedTotals.protein, accent: 'from-emerald-400/25 to-emerald-300/5' },
                { label: 'Carbs', value: resolvedTotals.carbs, accent: 'from-amber-400/25 to-amber-300/5' },
                { label: 'Fat', value: resolvedTotals.fat, accent: 'from-fuchsia-400/25 to-fuchsia-300/5' },
              ].map((macro) => (
                <div key={macro.label} className={`rounded-2xl border border-white/10 bg-gradient-to-b ${macro.accent} p-4 text-center shadow-sm`}>
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-300">{macro.label}</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{formatMacro(macro.value)}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-sm text-slate-400">Macros update from resolved food items only, so they stay consistent with the entries Gemini has broken down.</div>
          </div>
        </div>
      </section>

      <section className="mt-4">
        <h3 className="mb-2 font-medium">Quick Add — {labelTimeSlot(timeOfDay)}</h3>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label className="text-sm text-slate-300">
            Time of day
            <select
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(e.target.value)}
              className={`ml-2 ${surfaceInputClass}`}
            >
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="evening">Evening</option>
              <option value="night">Night</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {topPicks.map((p) => (
            <button key={p.display_name} className={`${pastelChipClass} min-h-10`} onClick={() => handleQuickAddAndSync(p.display_name)}>
              {p.display_name} +
            </button>
          ))}
        </div>
      </section>

      <section className="mt-4">
        <form
          onSubmit={async (e: FormEvent) => {
            e.preventDefault();
              await handleAddAndSync();
          }}
          className="flex flex-col gap-2"
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
                placeholder="Food title, e.g. Boiled eggs"
                value={foodTitle}
                onChange={(e) => setFoodTitle(e.target.value)}
              className={`w-full flex-1 ${surfaceInputClass}`}
            />
              <button className={`${pastelAddButtonClass} w-full sm:w-auto`} disabled={isSyncing || !foodTitle.trim()}>{isSyncing ? 'Saving…' : 'Add & Analyse'}</button>
          </div>
          <textarea
            placeholder="Optional recipe/ingredients with amounts, e.g. 3 eggs, 1 tsp ghee, 30g onion"
            value={recipeInput}
            onChange={(e) => setRecipeInput(e.target.value)}
            className="min-h-20 w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-white placeholder:text-slate-400 shadow-inner outline-none transition focus:border-cyan-200/40 focus:bg-white/12"
          />
        </form>
      </section>

      <section className="mt-6">
        <ul className="space-y-2">
          {selectedDayLogs.map((log) => (
            <li key={log.id} className="flex flex-col gap-3 rounded-[1.25rem] border border-white/10 bg-gradient-to-r from-white/8 via-sky-100/5 to-violet-100/5 p-3 shadow-[0_10px_30px_rgba(0,0,0,0.16)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="break-words font-medium">{log.display_name}</div>
                <div className={mealTagClass}>{labelTimeSlot(getLogMealSlot(log))}</div>
                {log.quantity ? <div className="text-xs text-slate-500">Qty: {log.quantity}</div> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <div className="text-sm whitespace-nowrap">{log.status === "pending" ? "pending" : `${Math.round(log.calories ?? 0)} kcal`}</div>
                  {log.status === 'resolved' ? (
                    <div className="text-xs text-slate-400 sm:text-right">
                      P {formatMacro(log.protein ?? 0)} C {formatMacro(log.carbs ?? 0)} F {formatMacro(log.fat ?? 0)}
                    </div>
                  ) : null}
                <div className={log.status === 'pending' ? 'text-slate-300' : 'text-emerald-200'} aria-hidden="true">
                  {log.status === 'pending' ? <FiClock className="h-4 w-4" /> : <FiCheckCircle className="h-4 w-4" />}
                </div>
                  {log.status === 'resolved' ? (
                  <button
                    type="button"
                    aria-label="Save food to database"
                      title={heartedLogs[log.id] ? 'Unsave from foods' : 'Save to foods'}
                      className={`${pastelHeartButtonClass} ${heartedLogs[log.id] ? 'border-rose-300/45 bg-rose-200/30 text-rose-300 shadow-sm shadow-rose-950/10' : ''}`}
                      disabled={pendingKey === `heart-${log.id}`}
                      onClick={() => handleHeart(log)}
                  >
                    <FiHeart className="h-4 w-4" />
                  </button>
                ) : null}
                <button className={`${pastelDeleteButtonClass} whitespace-nowrap`} onClick={() => handleDelete(log.id)} disabled={pendingKey === `del-${log.id}`}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {insight && (
        <section className="mt-6 rounded-[1.5rem] border border-amber-200/15 bg-gradient-to-br from-amber-100/8 via-slate-950 to-rose-100/8 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.2)]">
          <h4 className="font-semibold text-white">Today's Nutrition Report</h4>
          <div className="mt-2 text-sm">
            <div className="rounded-xl bg-emerald-100/8 px-3 py-2 text-emerald-50">🏆 Best choice: {insight.best_choice ?? "—"}</div>
            <div className="mt-2 rounded-xl bg-amber-100/8 px-3 py-2 text-amber-50">⚠️ Could skip: {insight.skip_suggestion ?? "—"}</div>
            <div className="mt-2 rounded-xl bg-sky-100/8 px-3 py-2 text-sky-50">📊 Intake: {insight.intake_assessment ?? "—"}</div>
          </div>
        </section>
      )}

      {/* Minimal, informative session summary */}
      <div className="mt-4 rounded-xl border border-white/6 bg-white/4 px-4 py-3 text-xs text-slate-300 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="leading-5">
          <strong>Saved:</strong> {Object.values(heartedLogs).filter(Boolean).length} •
          <strong className="ml-2">Entries:</strong> {selectedDayLogs.length} ({selectedDayLogs.filter((l) => l.status === 'resolved').length} done, {pendingCount} pending) •
          <strong className="ml-2">Total:</strong> {Math.round(totalCalories)} kcal
        </div>
        <div className="text-slate-400 leading-5">
          {insight ? (
            <span>Best: {insight.best_choice ?? '—'} · Skip: {insight.skip_suggestion ?? '—'} · {insight.intake_assessment ?? ''}</span>
          ) : (
            <span>Tip: click ♥ to save a food — saved items improve recommendations.</span>
          )}
        </div>
      </div>
    </div>
  );
}
