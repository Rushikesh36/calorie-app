"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { TopNav } from '@/components/top-nav';
import StatusClient from '@/components/status-client';
import type { DailyLog, WeightLog } from '@/lib/types';
import { getLogsInRange, getWeightLogsInRange } from '@/lib/browser-api';

const dailyCalorieTarget = { minimum: 1200, maximum: 2500 };

type RangeKey = 'week' | 'month' | 'all';

const rangeConfig: Record<RangeKey, { label: string; days: number | null }> = {
  week: { label: 'Last 7 days', days: 7 },
  month: { label: 'Last 30 days', days: 30 },
  all: { label: 'All time', days: null },
};

function toRangeKey(value?: string): RangeKey {
  return value === 'month' || value === 'all' ? value : 'week';
}

function formatCalories(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatDayLabel(date: Date) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

function dayKey(date: Date) {
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

function getCalories(log: DailyLog) {
  return log.calories ?? 0;
}

function getDayTotal(logs: DailyLog[]) {
  return logs.reduce((sum, log) => sum + getCalories(log), 0);
}

function groupByDay(logs: DailyLog[]) {
  const buckets = new Map<string, DailyLog[]>();

  for (const log of logs) {
    const key = dayKey(new Date(log.logged_at));
    const bucket = buckets.get(key) ?? [];
    bucket.push(log);
    buckets.set(key, bucket);
  }

  return buckets;
}

function createWindow(days: number) {
  const dates: Date[] = [];
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return { start, end, dates };
}

function buildTopFoods(logs: DailyLog[]) {
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
    .sort((left, right) => right.calories - left.calories)
    .slice(0, 5);
}

function LoadingShell() {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-soft backdrop-blur-xl">
      <div className="animate-pulse space-y-4">
        <div className="h-6 w-52 rounded-full bg-white/10" />
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="h-72 rounded-[1.5rem] bg-white/8" />
          <div className="h-72 rounded-[1.5rem] bg-white/8" />
        </div>
      </div>
    </div>
  );
}

type StatusPageClientProps = {
  loading?: boolean;
};

export default function StatusPageClient({ loading = false }: StatusPageClientProps) {
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [ready, setReady] = useState(false);
  const [selectedRange, setSelectedRange] = useState<RangeKey>('week');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSelectedRange(toRangeKey(params.get('range') ?? undefined));
  }, []);

  const config = rangeConfig[selectedRange];
  const dateWindow = useMemo(() => (config.days ? createWindow(config.days) : null), [config.days]);

  useEffect(() => {
    let active = true;
    setReady(false);

    (async () => {
      const [nextLogs, nextWeightLogs] = await Promise.all([
        dateWindow ? getLogsInRange({ start: dateWindow.start, end: dateWindow.end }) : getLogsInRange(),
        dateWindow ? getWeightLogsInRange({ start: dateWindow.start, end: dateWindow.end }) : getWeightLogsInRange(),
      ]);

      if (!active) return;
      setLogs(nextLogs);
      setWeightLogs(nextWeightLogs);
      setReady(true);
    })();

    return () => {
      active = false;
    };
  }, [dateWindow]);

  const totalCalories = getDayTotal(logs);
  const uniqueDays = new Set(logs.map((log) => dayKey(new Date(log.logged_at)))).size || (dateWindow?.dates.length ?? 1);
  const groupedDays = dateWindow
    ? dateWindow.dates.map((date) => {
        const key = dayKey(date);
        const entries = groupByDay(logs).get(key) ?? [];
        const calories = getDayTotal(entries);

        return {
          label: formatDayLabel(date),
          calories,
          entries: entries.length,
          inRange: calories >= dailyCalorieTarget.minimum && calories <= dailyCalorieTarget.maximum,
        };
      })
    : [];

  const bestDay = groupedDays.reduce(
    (top, day) => (day.calories < top.calories ? day : top),
    { label: 'No data', calories: 0, entries: 0, inRange: false },
  );
  const topFoods: { name: string; calories: number; count: number }[] = buildTopFoods(logs);

  if (loading) {
    return <LoadingShell />;
  }

  return (
    <main className="min-h-screen px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 pb-10">
        <TopNav active="status" />

        {!ready ? (
          <LoadingShell />
        ) : (
          <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-soft backdrop-blur-xl sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-300">{config.label}</div>
                <div className="text-sm text-slate-300">{formatCalories(totalCalories)} kcal</div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {(['week', 'month', 'all'] as const).map((range) => (
                  <Link
                    key={range}
                    href={`/status?range=${range}`}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition shadow-sm ${
                      selectedRange === range
                        ? 'border-cyan-200/30 bg-cyan-100/15 text-cyan-50'
                        : 'border-white/10 bg-slate-950/40 text-slate-300 hover:bg-white/8 hover:text-white'
                    }`}
                  >
                    {rangeConfig[range].label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="space-y-5">
              <StatusClient logs={logs} weightLogs={weightLogs} rangeLabel={config.label} windowDates={dateWindow ? dateWindow.dates.map((d) => d.toISOString()) : null} />
            </div>
          </section>
        )}
      </div>
    </main>
  );
}