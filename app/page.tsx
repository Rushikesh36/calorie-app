import { CalorieDashboard } from '@/components/calorie-dashboard';
import { TopNav } from '@/components/top-nav';
import { getTodaysLogs } from '@/app/actions';
import { hasSupabaseCredentials } from '@/lib/supabase';

export default async function HomePage() {
  const initialLogs = await getTodaysLogs();
  const canPersist = hasSupabaseCredentials();

  return (
    <main className="min-h-screen bg-radial-soft px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <TopNav active="dashboard" />
        <CalorieDashboard initialLogs={initialLogs} canPersist={canPersist} />
      </div>
    </main>
  );
}