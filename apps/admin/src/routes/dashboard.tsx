import { createFileRoute, redirect } from '@tanstack/react-router';
import { tenantSession } from '@/session/tenant-session';
import { DashboardPlaceholder } from '@/views/dashboard';

export const Route = createFileRoute('/dashboard')({
  beforeLoad: () => {
    if (!tenantSession.isSignedIn()) throw redirect({ to: '/sign-in' });
  },
  component: DashboardPlaceholder,
});
