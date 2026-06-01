"use client";

import { useEffect, useState } from 'react';
import { CalorieDashboard } from '@/components/calorie-dashboard';
import { TopNav } from '@/components/top-nav';
import type { DailyLog } from '@/lib/types';
import { getLogsInRange, hasBrowserSupabaseCredentials } from '@/lib/browser-api';

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

function determineTimeSlot(date: Date) {
  const hour = date.getHours();
  if (hour >= 5 && hour <= 10) return 'morning';
  if (hour >= 11 && hour <= 14) return 'afternoon';
  if (hour >= 15 && hour <= 20) return 'evening';
  return 'night';
}

function LoadingShell() {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-soft backdrop-blur-xl">
      <div className="animate-pulse space-y-4">
        <div className="h-6 w-40 rounded-full bg-white/10" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-44 rounded-[1.5rem] bg-white/8" />
          <div className="h-44 rounded-[1.5rem] bg-white/8" />
        </div>
        <div className="h-64 rounded-[1.5rem] bg-white/8" />
      </div>
    </div>
  );
}

export default function HomePage() {
  const [initialLogs, setInitialLogs] = useState<DailyLog[]>([]);
  const [canPersist, setCanPersist] = useState(false);
  const [initialSelectedDate, setInitialSelectedDate] = useState('');
  const [initialTimeOfDay, setInitialTimeOfDay] = useState<'morning' | 'afternoon' | 'evening' | 'night'>('night');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const now = new Date();
    let active = true;

    setInitialSelectedDate(getLocalDateKey(now));
    setInitialTimeOfDay(determineTimeSlot(now));
    setCanPersist(hasBrowserSupabaseCredentials());

    (async () => {
      const logs = await getLogsInRange();
      if (!active) return;
      setInitialLogs(logs);
      setReady(true);
    })();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-radial-soft px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <TopNav active="dashboard" />
        {!ready ? (
          <LoadingShell />
        ) : (
          <CalorieDashboard
            initialLogs={initialLogs}
            canPersist={canPersist}
            initialSelectedDate={initialSelectedDate}
            initialTimeOfDay={initialTimeOfDay}
            initialTodayKey={initialSelectedDate}
          />
        )}
      </div>
    </main>
  );
}