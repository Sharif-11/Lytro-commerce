import { createFileRoute, redirect } from '@tanstack/react-router';
import { tenantSession } from '@/session/tenant-session';
import { StaffSetPassword } from '@/views/staff-set-password';

export const Route = createFileRoute('/staff-set-password')({
  beforeLoad: async () => {
    await tenantSession.whenReady();
    if (!tenantSession.isSignedIn()) throw redirect({ to: '/staff-sign-in' });
  },
  component: StaffSetPassword,
});
