import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { tenantSession } from '@/session/tenant-session';
import { DashboardShell } from '@/components/layout/dashboard-shell';

// D32: one layout route does the session guard for every real dashboard destination (this route, plus
// staff/roles/activity nested under it) — replacing what used to be a separate beforeLoad check copy-pasted
// onto each one. create-shop/set-password/forgot-password stay outside this layout: they're transitional
// auth-flow screens, not dashboard destinations, and create-shop in particular has no tenant yet to show a
// dashboard shell for.
export const Route = createFileRoute('/dashboard')({
  beforeLoad: () => {
    if (!tenantSession.isSignedIn()) throw redirect({ to: '/sign-in' });
  },
  component: DashboardLayout,
});

function DashboardLayout(): React.JSX.Element {
  return (
    <DashboardShell>
      <Outlet />
    </DashboardShell>
  );
}
