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
} from "@/lib/browser-api";

type Props = {
  initialLogs: DailyLog[];
  initialInsight?: DailyInsight | null;
  canPersist: boolean;
  initialSelectedDate: string;
  initialTimeOfDay: string;
  initialTodayKey: string;
};

function getLocalDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '00';
  const day = parts.find((part) => part.type === 'day')?.value ?? '00';
  return `${year}-${month}-${day}`;
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

function getLogDateKey(log: DailyLog) {
  return getLocalDateKey(new Date(log.logged_at));
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

const mealTagBaseClass =
  'inline-flex items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] shadow-sm ring-1 ring-white/10 backdrop-blur-sm';

function getMealTagClass(slot: string) {
  switch (slot.toLowerCase()) {
    case 'morning':
      return `${mealTagBaseClass} border-amber-200/35 bg-amber-100/26 text-amber-50 shadow-[0_0_0_1px_rgba(253,230,138,0.12),0_0_18px_rgba(253,230,138,0.10)]`;
    case 'afternoon':
      return `${mealTagBaseClass} border-sky-200/35 bg-sky-100/24 text-sky-50 shadow-[0_0_0_1px_rgba(186,230,253,0.12),0_0_18px_rgba(186,230,253,0.10)]`;
    case 'evening':
      return `${mealTagBaseClass} border-violet-200/35 bg-violet-100/24 text-violet-50 shadow-[0_0_0_1px_rgba(221,214,254,0.12),0_0_18px_rgba(221,214,254,0.10)]`;
    case 'night':
      return `${mealTagBaseClass} border-rose-200/30 bg-rose-100/22 text-rose-50 shadow-[0_0_0_1px_rgba(254,205,211,0.12),0_0_18px_rgba(254,205,211,0.10)]`;
    default:
      return `${mealTagBaseClass} border-slate-200/20 bg-slate-100/14 text-slate-50`;
  }
}

function getTimeSlotControlClass(slot: string) {
  switch (slot.toLowerCase()) {
    case 'morning':
      return 'border-amber-200/35 bg-amber-100/22 text-amber-50 shadow-[0_0_0_1px_rgba(253,230,138,0.10),0_0_16px_rgba(253,230,138,0.08)]';
    case 'afternoon':
      return 'border-sky-200/35 bg-sky-100/22 text-sky-50 shadow-[0_0_0_1px_rgba(186,230,253,0.10),0_0_16px_rgba(186,230,253,0.08)]';
    case 'evening':
      return 'border-violet-200/35 bg-violet-100/22 text-violet-50 shadow-[0_0_0_1px_rgba(221,214,254,0.10),0_0_16px_rgba(221,214,254,0.08)]';
    case 'night':
      return 'border-rose-200/30 bg-rose-100/20 text-rose-50 shadow-[0_0_0_1px_rgba(254,205,211,0.10),0_0_16px_rgba(254,205,211,0.08)]';
    default:
      return 'border-white/10 bg-white/8 text-white';
  }
}

const calorieTarget = { low: 1900, high: 2100 };
const macroTargets = { protein: 120, carbs: 220, fat: 70 };

function clampPercent(value: number) {
  return Math.max(0, Math.min(value, 100));
}

function getCalorieTone(calories: number) {
  if (calories > calorieTarget.high) return 'from-rose-300 via-rose-200 to-orange-200';
  if (calories >= calorieTarget.low) return 'from-emerald-300 via-cyan-200 to-sky-200';
  return 'from-cyan-300 via-sky-200 to-emerald-200';
}

function getCalorieGaugeTone(calories: number) {
  if (calories > calorieTarget.high) {
    return {
      track: 'rgba(251,113,133,0.18)',
      stroke: 'rgba(248,113,113,0.95)',
      label: 'Over target',
      pill: 'border-rose-200/25 bg-rose-100/14 text-rose-50',
    };
  }

  if (calories >= calorieTarget.low) {
    return {
      track: 'rgba(250,204,21,0.18)',
      stroke: 'rgba(250,204,21,0.95)',
      label: 'On track',
      pill: 'border-amber-200/25 bg-amber-100/16 text-amber-50',
    };
  }

  return {
    track: 'rgba(134,239,172,0.16)',
    stroke: 'rgba(134,239,172,0.95)',
    label: 'Good pace',
    pill: 'border-emerald-200/25 bg-emerald-100/16 text-emerald-50',
  };
}

function getMacroTone(label: 'protein' | 'carbs' | 'fat', value: number) {
  const target = macroTargets[label];
  const ratio = target > 0 ? value / target : 0;

  if (label === 'protein') {
    if (ratio > 1) return 'from-emerald-300 via-cyan-200 to-emerald-200';
    if (ratio >= 0.8) return 'from-emerald-300 via-emerald-200 to-emerald-100';
    return 'from-emerald-300 via-cyan-200 to-sky-200';
  }

  if (ratio > 1) return 'from-rose-400 via-rose-300 to-orange-200';
  if (ratio >= 0.8) return 'from-rose-200 via-pink-200 to-rose-100';
  if (ratio >= 0.6) return 'from-amber-300 via-amber-200 to-rose-100';
  return label === 'carbs'
    ? 'from-amber-300 via-yellow-200 to-orange-200'
    : 'from-fuchsia-300 via-pink-200 to-rose-200';
}

function getMacroTrackClass(label: 'protein' | 'carbs' | 'fat', value: number) {
  const target = macroTargets[label];
  const ratio = target > 0 ? value / target : 0;

  if (label === 'protein') {
    if (ratio > 1) return 'border-emerald-200/35 bg-emerald-100/12 text-emerald-50';
    if (ratio >= 0.8) return 'border-emerald-200/25 bg-emerald-100/8 text-emerald-50';
    return 'border-emerald-200/15 bg-emerald-100/6 text-emerald-50';
  }

  if (ratio > 1) return 'border-rose-200/35 bg-rose-100/16 text-rose-50';
  if (ratio >= 0.8) return 'border-pink-200/30 bg-pink-100/18 text-rose-50';
  if (ratio >= 0.6) return 'border-pink-200/22 bg-pink-100/10 text-rose-50';
  return label === 'carbs'
    ? 'border-amber-200/18 bg-amber-100/8 text-amber-50'
    : 'border-fuchsia-200/18 bg-fuchsia-100/8 text-fuchsia-50';
}

function getMacroFillWidth(label: 'protein' | 'carbs' | 'fat', value: number) {
  const target = macroTargets[label];
  return `${clampPercent((value / Math.max(target, 1)) * 100)}%`;
}

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
    () => logs.filter((l) => getLogDateKey(l) === selectedDate).sort((a, b) => Number(new Date(b.logged_at)) - Number(new Date(a.logged_at))),
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
  const targetLow = calorieTarget.low;
  const targetHigh = calorieTarget.high;
  const targetLabel = `${targetLow}-${targetHigh} kcal`;
  const calorieProgress = Math.min((totalCalories / targetHigh) * 100, 100);
  const calorieDial = getCalorieGaugeTone(totalCalories);
  const macroCards: Array<{
    key: 'protein' | 'carbs' | 'fat';
    label: string;
    value: number;
    target: number;
  }> = [
    { key: 'protein', label: 'Protein', value: resolvedTotals.protein, target: macroTargets.protein },
    { key: 'carbs', label: 'Carbs', value: resolvedTotals.carbs, target: macroTargets.carbs },
    { key: 'fat', label: 'Fat', value: resolvedTotals.fat, target: macroTargets.fat },
  ];

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
    setSyncMessage('Syncing with Gemini...');
    try {
      const logCount = selectedDayLogs.length;
      const res = await syncDayWithGemini(selectedDate, timeOfDay);
      if (res.error) {
        setSyncError(res.error);
        setSyncMessage(null);
        return;
      }
      setLogs((current) => {
        const other = current.filter((l) => getLogDateKey(l) !== selectedDate);
        return [...(res.logs || []), ...other];
      });
      setInsight(res.insight ?? null);
      setSyncMessage(
        logCount === 0
          ? 'No entries were found for that day, but Gemini still analysed the empty log.'
          : `Synced ${logCount} log${logCount === 1 ? '' : 's'} for ${selectedDate}.`,
      );
    } catch (err: any) {
      console.error(err);
      setSyncError(err?.message || 'Sync failed. Check the server logs and Supabase/Gemini configuration.');
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-3 pb-20 pt-3 sm:px-4 sm:pb-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div>
          <h2 className="text-base font-semibold sm:text-lg">{selectedDate === todayKey ? "Today's log" : `${formatDateKeyLabel(selectedDate)} log`}</h2>
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
          <button type="button" className={`${syncButtonClass} w-full sm:w-auto`} disabled={isSyncing} onClick={handleSync}>
            {isSyncing ? "Syncing…" : "⚡ Sync & Analyse Day"}
          </button>
        </div>
        <div aria-live="polite" className="min-h-5 sm:text-right">
          {syncMessage || syncError ? (
            <div className={`rounded-2xl border px-3 py-2 text-sm shadow-sm ${syncError ? 'border-rose-200/25 bg-rose-100/10 text-rose-100' : 'border-emerald-200/20 bg-emerald-100/10 text-emerald-100'}`}>
              {syncError ? syncError : syncMessage}
            </div>
          ) : null}
        </div>
      </div>

      <section className="mt-2">
        <div className="relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-slate-950/70 p-3 shadow-[0_18px_50px_rgba(0,0,0,0.3)] sm:p-4">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(167,243,208,0.12),transparent_26%)]" />
          <div className="relative grid gap-3 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[1.3rem] border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
              <div className="flex flex-col items-center justify-center gap-4">
                <div className="relative flex h-56 w-56 items-center justify-center sm:h-60 sm:w-60">
                  <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
                    <circle cx="60" cy="60" r="46" fill="none" stroke={calorieDial.track} strokeWidth="10" />
                    <circle
                      cx="60"
                      cy="60"
                      r="46"
                      fill="none"
                      stroke={calorieDial.stroke}
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={`${clampPercent(calorieProgress)} 100`}
                      pathLength="100"
                    />
                  </svg>

                  <div className="relative z-10 flex h-44 w-44 flex-col items-center justify-center rounded-full border border-white/10 bg-slate-950/80 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_20px_50px_rgba(0,0,0,0.35)]">
                    <div className="text-[0.58rem] uppercase tracking-[0.3em] text-slate-400">Calories</div>
                    <div className="mt-2 text-4xl font-semibold tracking-tight text-white">{Math.round(totalCalories)}</div>
                    <div className={`mt-3 rounded-full border px-3 py-1 text-[0.62rem] uppercase tracking-[0.22em] ${calorieDial.pill}`}>
                      {calorieDial.label}
                    </div>
                    <div className="mt-2 text-xs text-slate-400">{Math.round(calorieProgress)}% of target</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[1.3rem] border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
              <div className="flex items-end justify-between gap-2">
                <div>
                  <div className="text-[0.62rem] uppercase tracking-[0.28em] text-slate-400">Macros</div>
                  <h3 className="mt-1 text-base font-semibold text-white sm:text-lg">Protein, carbs, fats</h3>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {macroCards.map((macro) => {
                  const labelKey = macro.key;
                  const target = macro.target;
                  const ratio = target > 0 ? macro.value / target : 0;
                  const fillWidth = getMacroFillWidth(labelKey, macro.value);
                  const cardTone = getMacroTrackClass(labelKey, macro.value);
                  const fillTone = getMacroTone(labelKey, macro.value);

                  return (
                    <div key={macro.key} className={`rounded-2xl border p-3 ${cardTone}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[0.62rem] uppercase tracking-[0.22em] text-slate-300">{macro.label}</div>
                          <div className="mt-1 text-sm font-semibold text-white">
                            {Math.round(macro.value)}g <span className="text-[0.65rem] font-normal text-slate-300">/ {target}g ideal</span>
                          </div>
                        </div>
                        <div className="text-right text-[0.62rem] text-slate-300">
                          <div>{Math.round(ratio * 100)}%</div>
                        </div>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                        <div className={`h-full rounded-full bg-gradient-to-r ${fillTone}`} style={{ width: fillWidth }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <select
            aria-label="Time of day"
            value={timeOfDay}
            onChange={(e) => setTimeOfDay(e.target.value)}
            className={`${surfaceInputClass} ${getTimeSlotControlClass(timeOfDay)}`}
          >
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="evening">Evening</option>
              <option value="night">Night</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {topPicks.map((p) => (
            <button
              key={p.display_name}
              className={`${pastelChipClass} min-h-10`}
              onClick={() => {
                const description = p.description?.trim() || p.raw_input?.trim() || recipeInput.trim() || null;
                handleAddPending(p.display_name, description);
              }}
            >
              {p.display_name} +
            </button>
          ))}
        </div>
      </section>

      <section className="mt-4">
        <form
          onSubmit={async (e: FormEvent) => {
            e.preventDefault();
              const title = foodTitle.trim();
              if (!title) return;
              await handleAddPending(title, recipeInput.trim() || null);
              setFoodTitle("");
              setRecipeInput("");
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
              <button className={`${pastelAddButtonClass} w-full sm:w-auto`} disabled={isSyncing || !foodTitle.trim()}>{isSyncing ? 'Saving…' : 'Add'}</button>
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
                <div className={getMealTagClass(getLogMealSlot(log))}>{labelTimeSlot(getLogMealSlot(log))}</div>
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
        <section className="mt-4 rounded-[1.25rem] border border-white/10 bg-white/5 p-3 shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-200/15 bg-emerald-100/8 px-3 py-2 text-emerald-50">{insight.best_choice ?? '—'}</div>
            <div className="rounded-xl border border-amber-200/15 bg-amber-100/8 px-3 py-2 text-amber-50">{insight.skip_suggestion ?? '—'}</div>
            <div className="rounded-xl border border-sky-200/15 bg-sky-100/8 px-3 py-2 text-sky-50">{insight.intake_assessment ?? '—'}</div>
          </div>
        </section>
      )}

      <div className="mt-4 rounded-xl border border-white/6 bg-white/4 px-4 py-3 text-xs text-slate-300 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="leading-5">
          <strong>Saved:</strong> {Object.values(heartedLogs).filter(Boolean).length} •
          <strong className="ml-2">Entries:</strong> {selectedDayLogs.length} ({selectedDayLogs.filter((l) => l.status === 'resolved').length} done, {pendingCount} pending) •
          <strong className="ml-2">Total:</strong> {Math.round(totalCalories)} kcal
        </div>
        <div className="text-slate-400 leading-5">{insight ? <span>{insight.gemini_summary ?? ''}</span> : null}</div>
      </div>
    </div>
  );
}
