'use client';

import React, { useMemo } from 'react';
import type { DailyLogEntry } from '@/lib/types';
import { dailyCalorieTarget } from '@/lib/meal-catalog';

type Props = {
  logs: DailyLogEntry[];
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

function getCalories(log: DailyLogEntry) {
  return log.food?.calories ?? log.custom_calories ?? 0;
}

export default function StatusClient({ logs, rangeLabel, windowDates = null }: Props) {
  const grouped = useMemo(() => {
    const buckets = new Map<string, DailyLogEntry[]>();
    for (const log of logs) {
      const key = dayKeyLocal(log.timestamp);
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
  const uniqueDays = useMemo(() => new Set(logs.map((l) => dayKeyLocal(l.timestamp))).size || (windowDatesParsed?.length ?? 1), [logs, windowDatesParsed]);
  const averagePerDay = uniqueDays > 0 ? totalCalories / uniqueDays : 0;
  const inRangeDays = useMemo(() => (groupedDays.length > 0 ? groupedDays.filter((d) => d.inRange).length : 0), [groupedDays]);
  const bestDay = groupedDays.reduce((top, day) => (day.calories > top.calories ? day : top), { label: 'No data', calories: 0, entries: 0, inRange: false });
  const topFoods = useMemo(() => {
    const counts = new Map<string, { calories: number; count: number }>();
    for (const log of logs) {
      const name = log.food?.name ?? log.custom_name ?? 'Custom item';
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

  return (
    <div>
      <div className="mt-6 space-y-3">
        {groupedDays.map((day) => {
          const width = Math.max((day.calories / maxBarCalories) * 100, day.calories > 0 ? 8 : 2);

          return (
            <div key={day.label} className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3">
              <div className="flex items-center justify-between gap-4 text-sm">
                <div>
                  <div className="font-medium text-white">{day.label}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{day.entries} entries</div>
                </div>
                <div className={`rounded-full px-3 py-1 text-xs font-semibold ${day.inRange ? 'bg-emerald-400/15 text-emerald-100' : 'bg-slate-800 text-slate-300'}`}>
                  {formatCalories(day.calories)} kcal
                </div>
              </div>

              <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-800/80">
                <div className={`h-full rounded-full transition-all ${day.inRange ? 'bg-gradient-to-r from-emerald-400 via-cyan-400 to-sky-400' : 'bg-gradient-to-r from-slate-500 via-cyan-400 to-slate-300'}`} style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Total calories</div>
          <div className="mt-2 text-3xl font-semibold text-white">{formatCalories(totalCalories)}</div>
          <div className="mt-2 text-sm text-slate-400">Across {rangeLabel.toLowerCase()}.</div>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Best day</div>
          <div className="mt-2 text-3xl font-semibold text-white">{formatCalories(bestDay.calories)}</div>
          <div className="mt-2 text-sm text-slate-400">{bestDay.label}</div>
        </div>
      </div>

      <div className="mt-6 grid gap-3">
        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
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

        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Average / day</div>
          <div className="mt-2 text-3xl font-semibold text-white">{formatCalories(Math.round(averagePerDay))}</div>
          <div className="mt-2 text-sm text-slate-400">{inRangeDays}/{windowDatesParsed?.length ?? 'N/A'} in range</div>
        </div>
      </div>

      <div className="mt-6">
        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Entries logged</div>
          <div className="mt-2 text-3xl font-semibold text-white">{logs.length}</div>
          <div className="mt-2 text-sm text-slate-400">All meals and custom items in this range.</div>
        </div>
      </div>
    </div>
  );
}
