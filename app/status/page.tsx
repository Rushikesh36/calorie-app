import { Suspense } from 'react';
import StatusPageClient from './status-page-client';

export default function StatusPage() {
  return (
    <Suspense fallback={<StatusPageClient loading />}>
      <StatusPageClient />
    </Suspense>
  );
}