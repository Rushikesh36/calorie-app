'use client';

import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { FiEdit2, FiPlus, FiTrash2, FiX, FiActivity, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import {
  Brush,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DailyLog, WeightLog } from '@/lib/types';
import { addWeightLog, deleteWeightLog, updateWeightLog } from '@/lib/browser-api';

const dailyCalorieTarget = { minimum: 1200, maximum: 2500 };
const MAINTENANCE_CALORIES = 2550;

type AnalysisResult = {
  summary: string;
  weightTrend: string;
  caloriePattern: string;
  recommendations: string[];
  verdict: string;
  dailyCalorieAdvice: string;
};

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

type BrushRange = {
  startIndex: number;
  endIndex: number;
};

type WeightChartPoint = {
  measuredAt: string;
  label: string;
  fullLabel: string;
  weight: number;
  benchmark: number;
  note: string | null;
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

function WeightChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: WeightChartPoint }> }) {
  if (!active || !payload?.length || !payload[0]?.payload) return null;

  const point = payload[0].payload;

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/95 px-4 py-3 shadow-[0_18px_30px_rgba(0,0,0,0.35)] backdrop-blur">
      <div className="text-sm font-semibold text-white">{point.fullLabel}</div>
      <div className="mt-2 space-y-1 text-sm text-slate-300">
        <div>Weight: {formatWeight(point.weight)}</div>
        <div>Trend: {formatWeight(point.benchmark)}</div>
{point.note ? <div className="pt-1 text-slate-400">{point.note}</div> : null}
      </div>
    </div>
  );
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
  const [brushRange, setBrushRange] = useState<BrushRange | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingWeight, setEditingWeight] = useState('');
  const [editingNote, setEditingNote] = useState('');
  const [editingMeasuredAt, setEditingMeasuredAt] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);

  useEffect(() => {
    setWeightEntries([...weightLogs].sort((a, b) => Number(new Date(b.measured_at)) - Number(new Date(a.measured_at))));
  }, [weightLogs]);

  const weightChartData = useMemo(() => {
    const sortedAscending = [...weightEntries].sort((a, b) => Number(new Date(a.measured_at)) - Number(new Date(b.measured_at)));
    if (sortedAscending.length === 0) {
      return [] as WeightChartPoint[];
    }

    const firstDate = new Date(sortedAscending[0].measured_at);
    const firstWeight = sortedAscending[0].weight_kg;

    return sortedAscending.map((entry) => {
      const measuredDate = new Date(entry.measured_at);
      const daysForward = Math.max(0, (measuredDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
      const benchmark = firstWeight - 3 * (daysForward / 30);

      return {
        measuredAt: entry.measured_at,
        label: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(measuredDate),
        fullLabel: formatChartDate(measuredDate),
        weight: entry.weight_kg,
        benchmark,
        note: entry.note,
      };
    });
  }, [weightEntries]);

  useEffect(() => {
    if (weightChartData.length === 0) {
      setBrushRange(null);
      return;
    }

    const endIndex = weightChartData.length - 1;
    const startIndex = Math.max(0, endIndex - 11);
    setBrushRange({ startIndex, endIndex });
  }, [weightChartData.length]);

  const visibleWeightChartData = useMemo(() => {
    if (weightChartData.length === 0) return [] as WeightChartPoint[];

    const startIndex = brushRange?.startIndex ?? 0;
    const endIndex = brushRange?.endIndex ?? weightChartData.length - 1;
    return weightChartData.slice(startIndex, endIndex + 1);
  }, [brushRange, weightChartData]);

  const chartRangeLabel = useMemo(() => {
    if (visibleWeightChartData.length === 0) return 'No entries selected';

    const first = visibleWeightChartData[0];
    const last = visibleWeightChartData[visibleWeightChartData.length - 1];

    return `${first.fullLabel} - ${last.fullLabel}`;
  }, [visibleWeightChartData]);

  const latestWeight = weightChartData[weightChartData.length - 1]?.weight ?? 0;
  const visibleCount = visibleWeightChartData.length;

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
  const bestDay = groupedDays.reduce((top, day) => (day.calories < top.calories ? day : top), { label: 'No data', calories: 0, entries: 0, inRange: false });
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

  const deficitTracking = useMemo(() => {
    if (!windowDatesParsed || groupedDays.length === 0) return null;
    const todayKey = new Date().toLocaleDateString('en-CA');
    const TARGET_DAILY_DEFICIT = 825;

    const completedDays = groupedDays.filter((_, i) => {
      const date = windowDatesParsed[i];
      return date.toLocaleDateString('en-CA') !== todayKey;
    });

    const targetDeficit = TARGET_DAILY_DEFICIT * 7;
    const achievedDeficit = completedDays.reduce((sum, day) => {
      return sum + Math.max(0, MAINTENANCE_CALORIES - day.calories);
    }, 0);
    const pct = Math.min(100, Math.round((achievedDeficit / targetDeficit) * 100));
    const gap = targetDeficit - achievedDeficit;

    return { targetDeficit, achievedDeficit, completedDays: completedDays.length, pct, gap };
  }, [groupedDays, windowDatesParsed]);

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

  async function handleAnalyze() {
    setAnalyzing(true);
    setAnalysisResult(null);
    setAnalysisError(null);
    setAnalysisOpen(true);

    try {
      const weekDays = groupedDays.map((d) => `- ${d.label}: ${d.calories} kcal${d.inRange ? '' : ' (out of range)'}`).join('\n');
      const daysInWindow = windowDatesParsed?.length ?? 7;
      const weeklyMaintenance = MAINTENANCE_CALORIES * daysInWindow;
      const weeklyDeficit = weeklyMaintenance - totalCalories;

      const recentWeightLines = [...weightEntries]
        .sort((a, b) => Number(new Date(a.measured_at)) - Number(new Date(b.measured_at)))
        .slice(-10)
        .map((e) => `- ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(e.measured_at))}: ${e.weight_kg} kg`)
        .join('\n');

      const prompt = `You are a concise nutrition and fitness coach. Analyze the data below and give specific, honest advice.

Important context for analysis:

1. Calorie Target: The user is aiming for an aggressive ~3 kg/month fat loss. Daily intakes between 1,600 and 1,900 kcal are intentional and on target for this goal. Do not advise increasing calories to 2,000-2,100. Lower calorie days help protect the necessary deficit.
2. Weight Trend: Weight loss is not linear. Account for the "whoosh" effect (temporary water retention from training followed by sudden drops). Do not flag short-term weight fluctuations or plateaus as inconsistent; treat them as a normal part of the process.

Maintenance calories: ${MAINTENANCE_CALORIES} kcal/day
Period: ${daysInWindow} days

Daily calorie intake:
${weekDays || '- No data logged'}

Summary:

* Total consumed: ${totalCalories} kcal
* Total maintenance: ${weeklyMaintenance} kcal
* Net deficit (positive = burning fat): ${weeklyDeficit} kcal
* Average per day: ${Math.round(averagePerDay)} kcal
* Days on target: ${inRangeDays} / ${daysInWindow}

Weight history (most recent entries):
${recentWeightLines || '- No weight entries'}

Return ONLY a JSON object with exactly these fields (no markdown, no code block):
{
"summary": "2-3 sentence overall assessment",
"weightTrend": "Brief weight trend analysis, factoring in normal fluctuations and the 'whoosh' effect, or 'No weight data available' if none",
"caloriePattern": "Brief analysis of calorie intake consistency, acknowledging that 1600-1900 kcal is the target range",
"recommendations": ["actionable tip 1", "actionable tip 2", "actionable tip 3"],
"verdict": "One of: On Track | Great Progress | Needs Attention | Minor Adjustment Needed",
"dailyCalorieAdvice": "Specific daily calorie target or tweak (e.g. 'Maintain 1600-1900 kcal/day to protect your 3kg/month pace')"
}`;

      const res = await fetch('/api/gemini/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) throw new Error('Analysis request failed');
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const parsed: AnalysisResult = JSON.parse(data.text);
      setAnalysisResult(parsed);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Analysis failed. Try again.');
    } finally {
      setAnalyzing(false);
    }
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

      {/* Calories burned + deficit target tracker */}
      {(() => {
        const daysInWindow = windowDatesParsed?.length ?? 7;
        const maintenance = MAINTENANCE_CALORIES * daysInWindow;
        const deficit = maintenance - totalCalories;
        const isDeficit = deficit > 0;
        const fatGrams = Math.round(Math.max(0, deficit) / 7.7);

        return (
          <div className="mt-4 space-y-3">
            {/* Calories burned */}
            <div className={`rounded-[1.5rem] border p-4 shadow-[0_10px_30px_rgba(0,0,0,0.14)] ${isDeficit ? 'border-emerald-200/20 bg-gradient-to-br from-emerald-100/10 via-slate-950/60 to-teal-100/10' : 'border-rose-200/20 bg-gradient-to-br from-rose-100/10 via-slate-950/60 to-pink-100/10'}`}>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Calories burned (deficit)</div>
              <div className={`mt-2 text-3xl font-semibold ${isDeficit ? 'text-emerald-300' : 'text-rose-300'}`}>
                {isDeficit ? '+' : ''}{new Intl.NumberFormat('en-US').format(Math.abs(deficit))} kcal
              </div>
              <div className="mt-1 text-sm text-slate-400">
                {isDeficit
                  ? `${daysInWindow}-day deficit — ~${fatGrams}g of fat burned`
                  : `${daysInWindow}-day surplus vs ${new Intl.NumberFormat('en-US').format(MAINTENANCE_CALORIES)} kcal/day maintenance`}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
                <div>Maintenance <span className="font-semibold text-slate-300">{new Intl.NumberFormat('en-US').format(maintenance)} kcal</span></div>
                <div>Consumed <span className="font-semibold text-slate-300">{new Intl.NumberFormat('en-US').format(totalCalories)} kcal</span></div>
              </div>
            </div>

            {/* Weekly deficit target vs achieved (last 7 complete days, no today) */}
            {deficitTracking && (
              <div className={`rounded-[1.5rem] border p-4 shadow-[0_10px_30px_rgba(0,0,0,0.14)] ${deficitTracking.gap <= 0 ? 'border-emerald-200/20 bg-gradient-to-br from-emerald-100/8 via-slate-950/60 to-teal-100/8' : 'border-amber-200/20 bg-gradient-to-br from-amber-100/8 via-slate-950/60 to-orange-100/8'}`}>
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Weekly deficit target · last 7 days (excl. today)</div>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Achieved</div>
                    <div className={`text-2xl font-semibold ${deficitTracking.gap <= 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {new Intl.NumberFormat('en-US').format(deficitTracking.achievedDeficit)} kcal
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500 mb-1">Target</div>
                    <div className="text-2xl font-semibold text-slate-300">
                      {new Intl.NumberFormat('en-US').format(deficitTracking.targetDeficit)} kcal
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/8">
                  <div
                    className={`h-full rounded-full transition-all ${deficitTracking.gap <= 0 ? 'bg-gradient-to-r from-emerald-300 to-teal-300' : 'bg-gradient-to-r from-amber-300 to-orange-300'}`}
                    style={{ width: `${deficitTracking.pct}%` }}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>{deficitTracking.pct}% of weekly target</span>
                  <span>
                    {deficitTracking.gap > 0
                      ? `${new Intl.NumberFormat('en-US').format(deficitTracking.gap)} kcal short`
                      : `${new Intl.NumberFormat('en-US').format(Math.abs(deficitTracking.gap))} kcal over target`}
                  </span>
                </div>

                <div className="mt-2 text-xs text-slate-500">
                  825 kcal/day × 7 days = {new Intl.NumberFormat('en-US').format(deficitTracking.targetDeficit)} kcal target · based on {deficitTracking.completedDays} completed days
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Analyze button + results */}
      <div className="mt-6 rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-slate-950 via-slate-950/95 to-violet-100/5 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.2)] sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-slate-500">AI Analysis</div>
            <h3 className="mt-1 text-lg font-semibold text-white">Analyze my progress</h3>
            <p className="mt-1 text-sm text-slate-400">Get personalized recommendations based on your weight and calorie data.</p>
          </div>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing}
            className="inline-flex items-center gap-2 rounded-2xl border border-violet-200/25 bg-violet-100/14 px-5 py-3 font-medium text-violet-100 shadow-sm transition hover:bg-violet-100/22 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FiActivity className="h-4 w-4" />
            {analyzing ? 'Analyzing…' : 'Analyze'}
          </button>
        </div>

        {(analysisResult || analysisError || analyzing) && (
          <div className="mt-5">
            {analyzing && (
              <div className="space-y-3 animate-pulse">
                <div className="h-4 w-3/4 rounded-full bg-white/8" />
                <div className="h-4 w-1/2 rounded-full bg-white/8" />
                <div className="h-4 w-2/3 rounded-full bg-white/8" />
              </div>
            )}

            {analysisError && !analyzing && (
              <div className="rounded-2xl border border-rose-200/20 bg-rose-100/8 px-4 py-3 text-sm text-rose-300">
                {analysisError}
              </div>
            )}

            {analysisResult && !analyzing && (
              <div className="space-y-4">
                {/* Verdict badge */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                    analysisResult.verdict === 'Great Progress' ? 'bg-emerald-100/18 text-emerald-200 border border-emerald-200/25' :
                    analysisResult.verdict === 'On Track' ? 'bg-cyan-100/18 text-cyan-200 border border-cyan-200/25' :
                    analysisResult.verdict === 'Minor Adjustment Needed' ? 'bg-amber-100/18 text-amber-200 border border-amber-200/25' :
                    'bg-rose-100/18 text-rose-200 border border-rose-200/25'
                  }`}>
                    {analysisResult.verdict}
                  </span>
                </div>

                {/* Summary */}
                <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">Summary</div>
                  <p className="text-sm leading-relaxed text-slate-200">{analysisResult.summary}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {/* Weight trend */}
                  <div className="rounded-2xl border border-sky-200/12 bg-sky-100/6 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">Weight trend</div>
                    <p className="text-sm leading-relaxed text-slate-300">{analysisResult.weightTrend}</p>
                  </div>

                  {/* Calorie pattern */}
                  <div className="rounded-2xl border border-amber-200/12 bg-amber-100/6 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">Calorie pattern</div>
                    <p className="text-sm leading-relaxed text-slate-300">{analysisResult.caloriePattern}</p>
                  </div>
                </div>

                {/* Daily calorie advice */}
                <div className="rounded-2xl border border-violet-200/15 bg-violet-100/8 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">Daily target advice</div>
                  <p className="text-sm leading-relaxed text-violet-200">{analysisResult.dailyCalorieAdvice}</p>
                </div>

                {/* Recommendations */}
                <div className="rounded-2xl border border-emerald-200/12 bg-emerald-100/6 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">Recommendations</div>
                  <ul className="space-y-2">
                    {analysisResult.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-200">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100/18 text-xs font-semibold text-emerald-300">{i + 1}</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => { setAnalysisResult(null); setAnalysisError(null); }}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition"
                >
                  <FiX className="h-3.5 w-3.5" /> Clear results
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-slate-950 via-slate-950/95 to-cyan-100/5 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.2)] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Weight tracking</div>
            <h3 className="mt-2 text-2xl font-semibold text-white">Add your current weight</h3>
            <p className="mt-1 text-sm text-slate-400">Each entry saves with today&apos;s timestamp, then updates the chart below.</p>
          </div>
          <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3 sm:text-sm">
            <div className="rounded-2xl border border-rose-200/15 bg-rose-100/10 px-3 py-2 text-rose-100">Red: current weight</div>
            <div className="rounded-2xl border border-cyan-200/15 bg-cyan-100/10 px-3 py-2 text-cyan-100">Blue: benchmark -3kg/month</div>
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
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 pb-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Weight chart</div>
              <div className="mt-1 text-sm text-slate-300">Brush the timeline to zoom. Hover for exact values.</div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (weightChartData.length === 0) {
                  setBrushRange(null);
                  return;
                }

                setBrushRange({ startIndex: 0, endIndex: weightChartData.length - 1 });
              }}
              className="rounded-full border border-white/10 bg-white/8 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/12"
            >
              Show all
            </button>
          </div>

          {weightChartData.length === 0 ? (
            <div className="py-8 text-sm text-slate-400">Add at least one weight entry to see the chart.</div>
          ) : (
            <div className="mt-4 h-[380px] w-full rounded-[1.25rem] border border-white/5 bg-slate-950/60 p-2 sm:p-3">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={weightChartData} margin={{ top: 12, right: 18, bottom: 20, left: 8 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.14)" strokeDasharray="4 8" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatChartWeight}
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    domain={['dataMin - 1', 'dataMax + 1']}
                    width={64}
                  />
                  <Tooltip content={<WeightChartTooltip />} />
                  <Legend verticalAlign="top" height={28} wrapperStyle={{ color: '#cbd5e1' }} />
                  <Line
                    type="monotone"
                    dataKey="benchmark"
                    name="3 kg / month trend"
                    stroke="rgba(96,165,250,0.95)"
                    strokeWidth={2.5}
                    strokeDasharray="8 8"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    name="Actual weight"
                    stroke="rgba(248,113,113,0.98)"
                    strokeWidth={3.5}
                    dot={{ r: 4, fill: 'rgba(248,113,113,0.98)', strokeWidth: 2, stroke: 'rgba(15,23,42,0.95)' }}
                    activeDot={{ r: 6 }}
                  />
                  <Brush
                    dataKey="label"
                    height={26}
                    stroke="rgba(103,232,249,0.75)"
                    travellerWidth={12}
                    startIndex={brushRange?.startIndex ?? 0}
                    endIndex={brushRange?.endIndex ?? Math.max(weightChartData.length - 1, 0)}
                    tickFormatter={() => ''}
                    onChange={(range) => {
                      if (typeof range?.startIndex === 'number' && typeof range?.endIndex === 'number') {
                        setBrushRange({ startIndex: range.startIndex, endIndex: range.endIndex });
                      }
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="mt-3 flex flex-col gap-2 text-xs text-slate-400 sm:flex-row sm:flex-wrap sm:gap-3">
            <span>Latest: {latestWeight ? formatWeight(latestWeight) : '—'}</span>
            <span>Visible: {visibleCount} of {weightChartData.length}</span>
            <span>{chartRangeLabel}</span>
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
