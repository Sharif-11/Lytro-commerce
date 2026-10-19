import { createFileRoute, redirect } from '@tanstack/react-router';
import { tenantSession } from '@/session/tenant-session';
import { SetUp } from '@/views/set-up';

export const Route = createFileRoute('/set-up')({
  beforeLoad: async () => {
    await tenantSession.whenReady();
    if (!tenantSession.isSignedIn()) throw redirect({ to: '/sign-in', search: {} });
  },
  component: SetUp,
});
