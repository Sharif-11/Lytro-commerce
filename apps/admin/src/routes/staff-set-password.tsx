import { createFileRoute, redirect } from '@tanstack/react-router';
import { tenantSession } from '@/session/tenant-session';
import { StaffSetPassword } from '@/views/staff-set-password';

export const Route = createFileRoute('/staff-set-password')({
  beforeLoad: () => {
    if (!tenantSession.isSignedIn()) throw redirect({ to: '/staff-sign-in' });
  },
  component: StaffSetPassword,
});
