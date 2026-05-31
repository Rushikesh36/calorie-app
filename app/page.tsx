import { CalorieDashboard } from '@/components/calorie-dashboard';
import { TopNav } from '@/components/top-nav';
import { getLogsInRange } from '@/app/actions';
import { hasSupabaseCredentials } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const initialLogs = await getLogsInRange();
  const canPersist = hasSupabaseCredentials();
  const serverNow = new Date();
  const initialSelectedDate = new Intl.DateTimeFormat('en-CA').format(serverNow);
  const initialTimeOfDay = (() => {
    const hour = serverNow.getHours();
    if (hour >= 5 && hour <= 10) return 'morning';
    if (hour >= 11 && hour <= 14) return 'afternoon';
    if (hour >= 15 && hour <= 20) return 'evening';
    return 'night';
  })();
  const initialTodayKey = initialSelectedDate;

  return (
    <main className="min-h-screen bg-radial-soft px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <TopNav active="dashboard" />
        <CalorieDashboard
          initialLogs={initialLogs}
          canPersist={canPersist}
          initialSelectedDate={initialSelectedDate}
          initialTimeOfDay={initialTimeOfDay}
          initialTodayKey={initialTodayKey}
        />
      </div>
    </main>
  );
}