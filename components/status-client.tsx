'use client';

import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { FiEdit2, FiPlus, FiTrash2, FiX } from 'react-icons/fi';
import type { DailyLog, WeightLog } from '@/lib/types';
import { addWeightLog, deleteWeightLog, updateWeightLog } from '@/app/actions';

// fallback calorie target when not provided by app settings
const dailyCalorieTarget = { minimum: 1200, maximum: 2500 };

type Props = {
  logs: DailyLog[];
  weightLogs: WeightLog[];
  rangeLabel: string;
  windowDates?: string[] | null; // ISO date strings for window when provided
};

function formatCalories(value: number) {
  return new Intl.NumberFormat(undefined).format(value);
}

function dayKeyLocal(isoDateString: string) {
  const d = new Date(isoDateString);
  // en-CA gives YYYY-MM-DD in the user's local timezone
  return d.toLocaleDateString('en-CA');
}

function formatDayLabelLocal(date: Date) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function getCalories(log: DailyLog) {
  return (log.calories ?? 0);
}

function formatWeight(value: number) {
  return `${value.toFixed(1)} kg`;
}

function toLocalDateTimeValue(isoString: string) {
  const date = new Date(isoString);
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoFromLocalDateTime(value: string) {
  return new Date(value).toISOString();
}

function buildLinePath(values: number[], width: number, height: number, padding = 20) {
  if (values.length === 0) return '';

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 0.1);
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  return values
    .map((value, index) => {
      const x = padding + (values.length === 1 ? innerWidth / 2 : (index / (values.length - 1)) * innerWidth);
      const y = padding + ((max - value) / range) * innerHeight;
      return `${index === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');
}

export default function StatusClient({ logs, weightLogs, rangeLabel, windowDates = null }: Props) {
  const [weightEntries, setWeightEntries] = useState<WeightLog[]>([]);
  const [weightValue, setWeightValue] = useState('');
  const [weightNote, setWeightNote] = useState('');
  const [savingWeight, setSavingWeight] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingWeight, setEditingWeight] = useState('');
  const [editingNote, setEditingNote] = useState('');
  const [editingMeasuredAt, setEditingMeasuredAt] = useState('');

  useEffect(() => {
    setWeightEntries([...weightLogs].sort((a, b) => Number(new Date(b.measured_at)) - Number(new Date(a.measured_at))));
  }, [weightLogs]);

  const grouped = useMemo(() => {
    const buckets = new Map<string, DailyLog[]>();
    for (const log of logs) {
      const key = dayKeyLocal(log.logged_at ?? new Date().toISOString());
      const bucket = buckets.get(key) ?? [];
      bucket.push(log);
      buckets.set(key, bucket);
    }
    return buckets;
  }, [logs]);

  const windowDatesParsed = useMemo(() => {
    if (!windowDates) return null;
    return windowDates.map((d) => new Date(d));
  }, [windowDates]);

  const groupedDays = useMemo(() => {
    if (!windowDatesParsed) return [];

    return windowDatesParsed.map((date) => {
      const key = date.toLocaleDateString('en-CA');
      const entries = grouped.get(key) ?? [];
      const calories = entries.reduce((s, l) => s + getCalories(l), 0);

      return {
        label: formatDayLabelLocal(date),
        calories,
        entries: entries.length,
        inRange: calories >= dailyCalorieTarget.minimum && calories <= dailyCalorieTarget.maximum,
      };
    });
  }, [grouped, windowDatesParsed]);

  const totalCalories = useMemo(() => logs.reduce((s, l) => s + getCalories(l), 0), [logs]);
  const uniqueDays = useMemo(() => new Set(logs.map((l) => dayKeyLocal(l.logged_at))).size || (windowDatesParsed?.length ?? 1), [logs, windowDatesParsed]);
  const averagePerDay = uniqueDays > 0 ? totalCalories / uniqueDays : 0;
  const inRangeDays = useMemo(() => (groupedDays.length > 0 ? groupedDays.filter((d) => d.inRange).length : 0), [groupedDays]);
  const bestDay = groupedDays.reduce((top, day) => (day.calories > top.calories ? day : top), { label: 'No data', calories: 0, entries: 0, inRange: false });
  const topFoods = useMemo(() => {
    const counts = new Map<string, { calories: number; count: number }>();
    for (const log of logs) {
      const name = log.display_name ?? 'Custom item';
      const current = counts.get(name) ?? { calories: 0, count: 0 };
      current.count += 1;
      current.calories += getCalories(log);
      counts.set(name, current);
    }
    return [...counts.entries()]
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.calories - a.calories)
      .slice(0, 5);
  }, [logs]);

  const maxBarCalories = Math.max(dailyCalorieTarget.maximum, ...groupedDays.map((day) => day.calories), 1);
  const totalProgressValue = Math.min((totalCalories / (dailyCalorieTarget.maximum * Math.max(uniqueDays, 1))) * 100, 100);

  const weightChart = useMemo(() => {
    const sortedAscending = [...weightEntries].sort((a, b) => Number(new Date(a.measured_at)) - Number(new Date(b.measured_at)));
    const n = sortedAscending.length;
    const latestWeight = sortedAscending[n - 1]?.weight_kg ?? 0;
    const latestDate = n > 0 ? new Date(sortedAscending[n - 1].measured_at) : new Date();
    const firstDate = n > 0 ? new Date(sortedAscending[0].measured_at) : latestDate;

    // benchmark: a line with slope -2 kg per week (2 kg loss per 7 days) referenced to the latest weight/date
    const benchmarkValues = sortedAscending.map((entry) => {
      const d = new Date(entry.measured_at);
      const daysFromLatest = (d.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24);
      const weeksFromLatest = daysFromLatest / 7;
      return latestWeight - 2 * weeksFromLatest;
    });

    // ideal path: a steady -2 kg/week line starting from the first entry
    const idealValues = sortedAscending.map((entry) => {
      const d = new Date(entry.measured_at);
      const daysFromFirst = (d.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);
      const weeksFromFirst = daysFromFirst / 7;
      const startWeight = sortedAscending[0].weight_kg;
      return startWeight - 2 * weeksFromFirst;
    });

    const values = [
      ...sortedAscending.map((entry) => entry.weight_kg),
      ...idealValues,
      ...benchmarkValues,
    ];

    const chartWidth = 640;
    const chartHeight = 240;
    const padding = 24;
    const innerWidth = chartWidth - padding * 2;
    const innerHeight = chartHeight - padding * 2;
    const minValue = values.length > 0 ? Math.min(...values) : 0;
    const maxValue = values.length > 0 ? Math.max(...values) : 1;
    const span = Math.max(maxValue - minValue, 0.1);

    const toPoint = (value: number, index: number, total: number) => {
      const x = padding + (total === 1 ? innerWidth / 2 : (index / (total - 1)) * innerWidth);
      const y = padding + ((maxValue - value) / span) * innerHeight;
      return { x, y };
    };

    return {
      chartWidth,
      chartHeight,
      sortedAscending,
      latestWeight,
      benchmarkValues,
      actualPath: buildLinePath(sortedAscending.map((entry) => entry.weight_kg), chartWidth, chartHeight, padding),
      benchmarkPath: buildLinePath(benchmarkValues, chartWidth, chartHeight, padding),
      idealPath: buildLinePath(idealValues, chartWidth, chartHeight, padding),
      actualPoints: sortedAscending.map((entry, index) => toPoint(entry.weight_kg, index, sortedAscending.length)),
      benchmarkPoints: benchmarkValues.map((value, index) => toPoint(value, index, sortedAscending.length)),
      idealPoints: idealValues.map((value, index) => toPoint(value, index, idealValues.length)),
    };
  }, [weightEntries]);

  async function handleAddWeightLog(e: FormEvent) {
    e.preventDefault();
    const parsedWeight = Number(weightValue);
    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) return;

    setSavingWeight(true);
    const added = await addWeightLog({
      weight_kg: parsedWeight,
      note: weightNote.trim() || null,
      measured_at: new Date().toISOString(),
    });

    if (added) {
      setWeightEntries((current) => [added, ...current.filter((entry) => entry.id !== added.id)].sort((a, b) => Number(new Date(b.measured_at)) - Number(new Date(a.measured_at))));
      setWeightValue('');
      setWeightNote('');
    }

    setSavingWeight(false);
  }

  function startEditWeight(entry: WeightLog) {
    setEditingId(entry.id);
    setEditingWeight(entry.weight_kg.toString());
    setEditingNote(entry.note ?? '');
    setEditingMeasuredAt(toLocalDateTimeValue(entry.measured_at));
  }

  function cancelEditWeight() {
    setEditingId(null);
    setEditingWeight('');
    setEditingNote('');
    setEditingMeasuredAt('');
  }

  async function handleSaveWeightLog(id: string) {
    const parsedWeight = Number(editingWeight);
    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) return;

    setSavingWeight(true);
    const updated = await updateWeightLog(id, {
      weight_kg: parsedWeight,
      note: editingNote.trim() || null,
      measured_at: editingMeasuredAt ? toIsoFromLocalDateTime(editingMeasuredAt) : new Date().toISOString(),
    });

    if (updated) {
      setWeightEntries((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)).sort((a, b) => Number(new Date(b.measured_at)) - Number(new Date(a.measured_at))));
      cancelEditWeight();
    }

    setSavingWeight(false);
  }

  async function handleDeleteWeightLog(id: string) {
    setSavingWeight(true);
    const ok = await deleteWeightLog(id);
    if (ok) {
      setWeightEntries((current) => current.filter((entry) => entry.id !== id));
      if (editingId === id) cancelEditWeight();
    }
    setSavingWeight(false);
  }

  return (
    <div>
      <div className="mt-6 space-y-3">
        {groupedDays.map((day) => {
          const width = Math.max((day.calories / maxBarCalories) * 100, day.calories > 0 ? 8 : 2);

          return (
            <div key={day.label} className="rounded-2xl border border-sky-200/15 bg-gradient-to-br from-sky-100/6 via-slate-950/60 to-violet-100/6 px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.16)]">
              <div className="flex items-center justify-between gap-4 text-sm">
                <div>
                  <div className="font-medium text-white">{day.label}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{day.entries} entries</div>
                </div>
                <div className={`rounded-full px-3 py-1 text-xs font-semibold shadow-sm ${day.inRange ? 'bg-emerald-100/15 text-emerald-50' : 'bg-white/8 text-slate-300'}`}>
                  {formatCalories(day.calories)} kcal
                </div>
              </div>

              <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/8">
                <div className={`h-full rounded-full transition-all ${day.inRange ? 'bg-gradient-to-r from-emerald-200 via-sky-200 to-cyan-200' : 'bg-gradient-to-r from-slate-400 via-sky-200 to-slate-200'}`} style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-[1.5rem] border border-rose-200/15 bg-gradient-to-br from-rose-100/8 via-slate-950/60 to-pink-100/8 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.14)]">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Total calories</div>
          <div className="mt-2 text-3xl font-semibold text-white">{formatCalories(totalCalories)}</div>
          <div className="mt-2 text-sm text-slate-400">Across {rangeLabel.toLowerCase()}.</div>
        </div>

        <div className="rounded-[1.5rem] border border-violet-200/15 bg-gradient-to-br from-violet-100/8 via-slate-950/60 to-sky-100/8 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.14)]">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Best day</div>
          <div className="mt-2 text-3xl font-semibold text-white">{formatCalories(bestDay.calories)}</div>
          <div className="mt-2 text-sm text-slate-400">{bestDay.label}</div>
        </div>
      </div>

      <div className="mt-6 grid gap-3">
        <div className="rounded-[1.5rem] border border-cyan-200/15 bg-gradient-to-br from-cyan-100/8 via-slate-950/60 to-emerald-100/8 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.14)]">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Top foods</div>
          <div className="mt-2 space-y-2">
            {topFoods.map((f) => (
              <div key={f.name} className="flex items-center justify-between">
                <div className="text-sm text-slate-200">{f.name}</div>
                <div className="text-sm font-semibold text-white">{formatCalories(f.calories)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-amber-200/15 bg-gradient-to-br from-amber-100/8 via-slate-950/60 to-rose-100/8 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.14)]">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Average / day</div>
          <div className="mt-2 text-3xl font-semibold text-white">{formatCalories(Math.round(averagePerDay))}</div>
          <div className="mt-2 text-sm text-slate-400">{inRangeDays}/{windowDatesParsed?.length ?? 'N/A'} in range</div>
        </div>
      </div>

      <div className="mt-6">
        <div className="rounded-[1.5rem] border border-emerald-200/15 bg-gradient-to-br from-emerald-100/8 via-slate-950/60 to-cyan-100/8 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.14)]">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Entries logged</div>
          <div className="mt-2 text-3xl font-semibold text-white">{logs.length}</div>
          <div className="mt-2 text-sm text-slate-400">All meals and custom items in this range.</div>
        </div>
      </div>

      <div className="mt-6 rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-slate-950 via-slate-950/95 to-cyan-100/5 p-5 shadow-[0_16px_40px_rgba(0,0,0,0.2)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Weight tracking</div>
            <h3 className="mt-2 text-2xl font-semibold text-white">Add your current weight</h3>
            <p className="mt-1 text-sm text-slate-400">Each entry saves with today&apos;s timestamp, then updates the chart below.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs sm:text-sm">
            <div className="rounded-2xl border border-rose-200/15 bg-rose-100/10 px-3 py-2 text-rose-100">Red: your weight</div>
            <div className="rounded-2xl border border-cyan-200/15 bg-cyan-100/10 px-3 py-2 text-cyan-100">Blue: benchmark -2kg</div>
            <div className="rounded-2xl border border-emerald-200/15 bg-emerald-100/10 px-3 py-2 text-emerald-100">Green: ideal path</div>
          </div>
        </div>

        <form onSubmit={handleAddWeightLog} className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500">Weight (kg)</span>
            <input
              type="number"
              min="1"
              step="0.1"
              value={weightValue}
              onChange={(e) => setWeightValue(e.target.value)}
              placeholder="Enter current weight"
              className="w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-white outline-none placeholder:text-slate-400"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500">Note</span>
            <input
              type="text"
              value={weightNote}
              onChange={(e) => setWeightNote(e.target.value)}
              placeholder="Optional note"
              className="w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-white outline-none placeholder:text-slate-400"
            />
          </label>
          <button
            type="submit"
            disabled={savingWeight}
            className="mt-auto inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200/20 bg-emerald-100/12 px-4 py-3 font-medium text-emerald-50 transition hover:bg-emerald-100/18 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FiPlus className="h-4 w-4" />
            {savingWeight ? 'Saving…' : 'Add weight'}
          </button>
        </form>

        <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
          <svg viewBox={`0 0 ${weightChart.chartWidth} ${weightChart.chartHeight}`} className="h-64 w-full">
            <path d={weightChart.benchmarkPath} fill="none" stroke="rgba(96,165,250,0.9)" strokeWidth="3" strokeDasharray="8 8" />
            <path d={weightChart.idealPath} fill="none" stroke="rgba(134,239,172,0.95)" strokeWidth="3" />
            <path d={weightChart.actualPath} fill="none" stroke="rgba(248,113,113,0.95)" strokeWidth="4" />
            {weightChart.benchmarkPoints.map((point, index) => (
              <circle key={`benchmark-${index}`} cx={point.x} cy={point.y} r="3.5" fill="rgba(96,165,250,0.95)" />
            ))}
            {weightChart.idealPoints.map((point, index) => (
              <circle key={`ideal-${index}`} cx={point.x} cy={point.y} r="3.5" fill="rgba(134,239,172,0.95)" />
            ))}
            {weightChart.actualPoints.map((point, index) => (
              <circle key={`actual-${index}`} cx={point.x} cy={point.y} r="4.5" fill="rgba(248,113,113,0.98)" />
            ))}
          </svg>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
            <span>Latest: {weightChart.latestWeight ? formatWeight(weightChart.latestWeight) : '—'}</span>
            <span>Benchmark rate: 2 kg/week</span>
            <span>{weightEntries.length} weight logs</span>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {weightEntries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-4 text-sm text-slate-400">No weight entries yet.</div>
          ) : (
            weightEntries.map((entry) => {
              const isEditing = editingId === entry.id;

              return (
                <div key={entry.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  {isEditing ? (
                    <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
                      <label className="block">
                        <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500">Weight (kg)</span>
                        <input
                          type="number"
                          min="1"
                          step="0.1"
                          value={editingWeight}
                          onChange={(e) => setEditingWeight(e.target.value)}
                          className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500">Timestamp</span>
                        <input
                          type="datetime-local"
                          value={editingMeasuredAt}
                          onChange={(e) => setEditingMeasuredAt(e.target.value)}
                          className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none"
                        />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500">Note</span>
                        <input
                          type="text"
                          value={editingNote}
                          onChange={(e) => setEditingNote(e.target.value)}
                          className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2 sm:col-span-2">
                        <button
                          type="button"
                          onClick={() => handleSaveWeightLog(entry.id)}
                          disabled={savingWeight}
                          className="inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-100/12 px-4 py-2 text-sm font-medium text-emerald-50 transition hover:bg-emerald-100/18 disabled:opacity-60"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditWeight}
                          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/12"
                        >
                          <FiX className="h-4 w-4" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-white">{formatWeight(entry.weight_kg)}</div>
                        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(entry.measured_at))}</div>
                        {entry.note ? <div className="mt-2 text-sm text-slate-300">{entry.note}</div> : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startEditWeight(entry)}
                          className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-100/12 px-3 py-2 text-sm font-medium text-cyan-50 transition hover:bg-cyan-100/18"
                        >
                          <FiEdit2 className="h-4 w-4" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteWeightLog(entry.id)}
                          disabled={savingWeight}
                          className="inline-flex items-center gap-2 rounded-full border border-rose-200/20 bg-rose-100/12 px-3 py-2 text-sm font-medium text-rose-50 transition hover:bg-rose-100/18 disabled:opacity-60"
                        >
                          <FiTrash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
