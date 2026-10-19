import { createFileRoute, redirect } from '@tanstack/react-router';
import { tenantSession } from '@/session/tenant-session';
import { Shops } from '@/views/shops';

// TEN-31: one sign-in covers every shop a person belongs to; this lands on the only shop, or shows the picker.
export const Route = createFileRoute('/shops')({
  beforeLoad: async () => {
    await tenantSession.whenReady();
    if (!tenantSession.isSignedIn()) throw redirect({ to: '/sign-in', search: {} });
  },
  component: Shops,
});
