import Link from 'next/link';
import { TopNav } from '@/components/top-nav';
import { getLogsInRange } from '@/app/actions';
import { dailyCalorieTarget } from '@/lib/meal-catalog';
import type { DailyLogEntry } from '@/lib/types';
import StatusClient from '@/components/status-client';

type RangeKey = 'week' | 'month' | 'all';

type StatusPageProps = {
  searchParams?: Promise<{
    range?: string;
  }>;
};

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
  return new Intl.DateTimeFormat('en-CA').format(date);
}

function getCalories(log: DailyLogEntry) {
  return log.food?.calories ?? log.custom_calories ?? 0;
}

function getDayTotal(logs: DailyLogEntry[]) {
  return logs.reduce((sum, log) => sum + getCalories(log), 0);
}

function groupByDay(logs: DailyLogEntry[]) {
  const buckets = new Map<string, DailyLogEntry[]>();

  for (const log of logs) {
    const key = dayKey(new Date(log.timestamp));
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

function buildTopFoods(logs: DailyLogEntry[]) {
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
    .sort((left, right) => right.calories - left.calories)
    .slice(0, 5);
}

export default async function StatusPage({ searchParams }: StatusPageProps) {
  const resolvedSearchParams = await searchParams;
  const selectedRange = toRangeKey(resolvedSearchParams?.range);
  const config = rangeConfig[selectedRange];
  const window = config.days ? createWindow(config.days) : null;

  const logs = window ? await getLogsInRange({ start: window.start, end: window.end }) : await getLogsInRange();
  // We will render aggregates and labels on the client so they use the user's local timezone.
  const totalCalories = getDayTotal(logs);
  const uniqueDays = new Set(logs.map((log) => dayKey(new Date(log.timestamp)))).size || (window?.dates.length ?? 1);
  const averagePerDay = uniqueDays > 0 ? totalCalories / uniqueDays : 0;
  const groupedDays = window
    ? window.dates.map((date) => {
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
    (top, day) => (day.calories > top.calories ? day : top),
    { label: 'No data', calories: 0, entries: 0, inRange: false },
  );
  const topFoods: { name: string; calories: number; count: number }[] = buildTopFoods(logs);
  const maxBarCalories = Math.max(dailyCalorieTarget.maximum, ...groupedDays.map((day) => day.calories), 1);
  const totalProgressValue = Math.min((totalCalories / (dailyCalorieTarget.maximum * Math.max(uniqueDays, 1))) * 100, 100);
  const inRangeDays = window ? groupedDays.filter((d) => d.inRange).length : 0;

  return (
    <main className="min-h-screen px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 pb-10">
        <TopNav active="status" />

        <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-soft backdrop-blur-xl sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-3">
                <div className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-cyan-100">
                  Weekly and monthly status
                </div>
                <div>
                  <h1 className="font-[family-name:var(--font-space-grotesk)] text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                    See your progress without squeezing it into the quick-add screen.
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                    Check how often you stay inside the {formatCalories(dailyCalorieTarget.minimum)} to {formatCalories(dailyCalorieTarget.maximum)} calorie window, how your week is trending, and which foods are driving the total.
                  </p>
                </div>
              </div>

              <div className="w-full max-w-xs rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
                <div className="flex items-center justify-between text-sm text-slate-400">
                  <span>{config.label}</span>
                  <span>{formatCalories(totalCalories)} kcal</span>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {(['week', 'month', 'all'] as const).map((range) => (
                <Link
                  key={range}
                  href={`/status?range=${range}`}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    selectedRange === range
                      ? 'border-cyan-300/40 bg-cyan-400/15 text-cyan-100'
                      : 'border-white/10 bg-slate-950/60 text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {rangeConfig[range].label}
                </Link>
              ))}
            </div>

            {/* Detailed day grouping renders client-side to respect user timezone */}
          </div>

          <div className="space-y-5">
            <StatusClient logs={logs} rangeLabel={config.label} windowDates={window ? window.dates.map((d) => d.toISOString()) : null} />
          </div>
        </section>
      </div>
    </main>
  );
}