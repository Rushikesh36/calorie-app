'use client';

import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { FiEdit2, FiPlus, FiTrash2, FiX } from 'react-icons/fi';
import type { DailyLog, WeightLog } from '@/lib/types';
import { addWeightLog, deleteWeightLog, updateWeightLog } from '@/lib/browser-api';

// fallback calorie target when not provided by app settings
const dailyCalorieTarget = { minimum: 1200, maximum: 2500 };

type Props = {
  logs: DailyLog[];
  weightLogs: WeightLog[];
  rangeLabel: string;
  windowDates?: string[] | null; // ISO date strings for window when provided
};

type ChartMargins = {
  top: number;
  right: number;
  bottom: number;
  left: number;
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
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

function getCalories(log: DailyLog) {
  return (log.calories ?? 0);
}

function formatWeight(value: number) {
  return `${value.toFixed(1)} kg`;
}

function formatChartWeight(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} kg`;
}

function formatChartDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function createTickValues(min: number, max: number, count: number) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || count <= 0) return [];
  if (count === 1 || min === max) return [min];

  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, index) => min + step * index);
}

function pickTickIndices(total: number, maxTicks: number) {
  if (total <= 0) return [];
  if (total === 1) return [0];
  if (maxTicks <= 1) return [0, total - 1];

  const step = Math.max(1, Math.floor((total - 1) / (maxTicks - 1)));
  const indices: number[] = [];
  for (let index = 0; index < total; index += step) {
    indices.push(index);
  }

  if (indices[indices.length - 1] !== total - 1) {
    indices.push(total - 1);
  }

  return [...new Set(indices)].slice(0, maxTicks);
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

function buildChartPath(values: number[], width: number, height: number, margins: ChartMargins, minValue: number, maxValue: number) {
  if (values.length === 0) return '';

  const plotWidth = width - margins.left - margins.right;
  const plotHeight = height - margins.top - margins.bottom;
  const range = Math.max(maxValue - minValue, 0.1);

  return values
    .map((value, index) => {
      const x = margins.left + (values.length === 1 ? plotWidth / 2 : (index / (values.length - 1)) * plotWidth);
      const y = margins.top + ((maxValue - value) / range) * plotHeight;
      return `${index === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');
}

function buildPathFromPoints(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return '';
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');
}

export default function StatusClient({ logs, weightLogs, rangeLabel, windowDates = null }: Props) {
  const [weightEntries, setWeightEntries] = useState<WeightLog[]>([]);
  const [weightValue, setWeightValue] = useState('');
  const [weightNote, setWeightNote] = useState('');
  const [savingWeight, setSavingWeight] = useState(false);
  const [zoom, setZoom] = useState(1);
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
    const targetWeight = 80;

    // Chart sizing
    const chartWidth = Math.max(760, 760);
    const chartHeight = 380;
    const margins: ChartMargins = {
      top: 24,
      right: 28,
      bottom: 78,
      left: 72,
    };

    if (n === 0) {
      return {
        chartWidth,
        chartHeight,
        margins,
        sortedAscending,
        latestWeight,
        benchmarkValues: [] as number[],
        targetValues: [] as number[],
        currentPath: '',
        benchmarkPath: '',
        targetPath: '',
        currentPoints: [] as Array<{ x: number; y: number; value: number; label: string }>,
        xTicks: [] as Array<{ x: number; label: string }> ,
        yTicks: [] as number[],
      };
    }

    // Determine visible window based on zoom. zoom=1 -> show all, zoom>1 -> show fewer recent points
    const visibleCount = Math.max(1, Math.round(n / zoom));
    const endIndex = n - 1;
    const startIndex = Math.max(0, n - visibleCount);

    const firstDate = new Date(sortedAscending[startIndex].measured_at);
    const latestDate = new Date(sortedAscending[endIndex].measured_at);

    // For single point, give a generous domain so lines have span
    if (visibleCount === 1) {
      firstDate.setDate(firstDate.getDate() - 30);
      latestDate.setDate(latestDate.getDate() + 30);
    }

    const domainSpanMs = Math.max(latestDate.getTime() - firstDate.getTime(), 1);

    const benchmarkValues = sortedAscending.map((entry) => {
      const d = new Date(entry.measured_at);
      const daysFromLatest = (d.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24);
      const monthsFromLatest = daysFromLatest / 30;
      return latestWeight - 2 * monthsFromLatest;
    });

    const targetValues = sortedAscending.map(() => targetWeight);

    // Value range and padding
    const currentValues = sortedAscending.map((entry) => entry.weight_kg);
    const allValues = [...currentValues, ...benchmarkValues, ...targetValues];
    const minValue = Math.min(...allValues);
    const maxValue = Math.max(...allValues);
    const valuePadding = Math.max(1, (maxValue - minValue) * 0.18);
    const chartMin = minValue - valuePadding;
    const chartMax = maxValue + valuePadding;
    const plotWidth = chartWidth - margins.left - margins.right;
    const plotHeight = chartHeight - margins.top - margins.bottom;

    const scaleX = (date: Date) => margins.left + ((date.getTime() - firstDate.getTime()) / domainSpanMs) * plotWidth;
    const scaleY = (value: number) => margins.top + ((chartMax - value) / Math.max(chartMax - chartMin, 0.1)) * plotHeight;

    // Points only for visible window
    const currentPoints = sortedAscending.slice(startIndex, endIndex + 1).map((entry) => ({
      x: scaleX(new Date(entry.measured_at)),
      y: scaleY(entry.weight_kg),
      value: entry.weight_kg,
      label: formatChartDate(new Date(entry.measured_at)),
    }));

    // X ticks chosen within visible window
    const visibleTotal = endIndex - startIndex + 1;
    const xTickRelIndices = pickTickIndices(visibleTotal, 6);
    const xTicks = xTickRelIndices.map((relIdx) => {
      const idx = startIndex + relIdx;
      return {
        x: scaleX(new Date(sortedAscending[idx].measured_at)),
        label: formatChartDate(new Date(sortedAscending[idx].measured_at)),
      };
    });

    const yTicks = createTickValues(chartMin, chartMax, 5);

    const currentPath = buildPathFromPoints(currentPoints);
    const benchmarkPath = buildPathFromPoints([
      { x: margins.left, y: scaleY(latestWeight - 2 * (((firstDate.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24)) / 30)) },
      { x: chartWidth - margins.right, y: scaleY(latestWeight - 2 * (((latestDate.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24)) / 30)) },
    ]);
    const targetPath = buildPathFromPoints([
      { x: margins.left, y: scaleY(targetWeight) },
      { x: chartWidth - margins.right, y: scaleY(targetWeight) },
    ]);

    return {
      chartWidth,
      chartHeight,
      margins,
      sortedAscending,
      latestWeight,
      benchmarkValues,
      targetValues,
      currentPath,
      benchmarkPath,
      targetPath,
      currentPoints,
      xTicks,
      yTicks,
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
            <div className="rounded-2xl border border-rose-200/15 bg-rose-100/10 px-3 py-2 text-rose-100">Red: current weight</div>
            <div className="rounded-2xl border border-cyan-200/15 bg-cyan-100/10 px-3 py-2 text-cyan-100">Blue: benchmark -2kg/month</div>
            <div className="rounded-2xl border border-emerald-200/15 bg-emerald-100/10 px-3 py-2 text-emerald-100">Green: flat 80kg line</div>
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
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Chart controls</div>
              <div className="mt-1 text-sm text-slate-300">Use zoom to inspect the timeline.</div>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs uppercase tracking-[0.2em] text-slate-500" htmlFor="weight-chart-zoom">
                Zoom
              </label>
              <input
                id="weight-chart-zoom"
                type="range"
                min="1"
                max="3"
                step="0.1"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-40 accent-cyan-300"
              />
              <span className="min-w-12 text-sm text-slate-300">{zoom.toFixed(1)}x</span>
            </div>
          </div>

          {weightChart.sortedAscending.length === 0 ? (
            <div className="py-8 text-sm text-slate-400">Add at least one weight entry to see the chart.</div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <svg
                viewBox={`0 0 ${weightChart.chartWidth} ${weightChart.chartHeight}`}
                className="block"
                style={{ width: `${weightChart.chartWidth}px`, minWidth: `${weightChart.chartWidth}px`, height: `${weightChart.chartHeight}px` }}
              >
                <line
                  x1={weightChart.margins.left}
                  y1={weightChart.margins.top}
                  x2={weightChart.margins.left}
                  y2={weightChart.chartHeight - weightChart.margins.bottom}
                  stroke="rgba(148,163,184,0.55)"
                  strokeWidth="1.5"
                />
                <line
                  x1={weightChart.margins.left}
                  y1={weightChart.chartHeight - weightChart.margins.bottom}
                  x2={weightChart.chartWidth - weightChart.margins.right}
                  y2={weightChart.chartHeight - weightChart.margins.bottom}
                  stroke="rgba(148,163,184,0.55)"
                  strokeWidth="1.5"
                />

                {weightChart.yTicks.map((tick) => {
                  const plotHeight = weightChart.chartHeight - weightChart.margins.top - weightChart.margins.bottom;
                  const y = weightChart.margins.top + ((Math.max(...weightChart.yTicks) - tick) / Math.max(Math.max(...weightChart.yTicks) - Math.min(...weightChart.yTicks), 0.1)) * plotHeight;

                  return (
                    <g key={`y-${tick}`}>
                      <line
                        x1={weightChart.margins.left}
                        y1={y}
                        x2={weightChart.chartWidth - weightChart.margins.right}
                        y2={y}
                        stroke="rgba(148,163,184,0.16)"
                        strokeDasharray="4 6"
                      />
                      <text x={weightChart.margins.left - 10} y={y + 4} textAnchor="end" className="fill-slate-400" style={{ fontSize: '11px' }}>
                        {formatChartWeight(tick)}
                      </text>
                    </g>
                  );
                })}

                {weightChart.xTicks.map((tick) => (
                  <g key={tick.label}>
                    <line
                      x1={tick.x}
                      y1={weightChart.chartHeight - weightChart.margins.bottom}
                      x2={tick.x}
                      y2={weightChart.chartHeight - weightChart.margins.bottom + 8}
                      stroke="rgba(148,163,184,0.55)"
                    />
                    <text
                      x={tick.x}
                      y={weightChart.chartHeight - weightChart.margins.bottom + 24}
                      textAnchor="middle"
                      className="fill-slate-400"
                      style={{ fontSize: '11px' }}
                    >
                      {tick.label}
                    </text>
                  </g>
                ))}

                <path d={weightChart.targetPath} fill="none" stroke="rgba(134,239,172,0.95)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <path d={weightChart.benchmarkPath} fill="none" stroke="rgba(96,165,250,0.95)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 8" />
                <path d={weightChart.currentPath} fill="none" stroke="rgba(248,113,113,0.98)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                {weightChart.currentPoints.map((point, index) => (
                  <circle key={`current-${index}`} cx={point.x} cy={point.y} r="5" fill="rgba(248,113,113,0.98)" stroke="rgba(15,23,42,0.9)" strokeWidth="2" />
                ))}

                <text x={weightChart.chartWidth / 2} y={weightChart.chartHeight - 16} textAnchor="middle" className="fill-slate-400" style={{ fontSize: '12px' }}>
                  Date, month, year
                </text>
                <text
                  x={18}
                  y={weightChart.chartHeight / 2}
                  transform={`rotate(-90 18 ${weightChart.chartHeight / 2})`}
                  textAnchor="middle"
                  className="fill-slate-400"
                  style={{ fontSize: '12px' }}
                >
                  Weight (kg)
                </text>
              </svg>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
            <span>Latest: {weightChart.latestWeight ? formatWeight(weightChart.latestWeight) : '—'}</span>
            <span>Benchmark rate: 2 kg/month</span>
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
                        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(entry.measured_at))}</div>
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
