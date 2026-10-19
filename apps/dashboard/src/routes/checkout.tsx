import { createFileRoute, redirect } from '@tanstack/react-router';
import { tenantSession } from '@/session/tenant-session';
import { Checkout } from '@/views/checkout';

// AUTH-29 step 2b: only reachable with a shop and a plan intent; otherwise the flow continues without it.
export const Route = createFileRoute('/checkout')({
  beforeLoad: async () => {
    await tenantSession.whenReady();
    if (!tenantSession.isSignedIn()) throw redirect({ to: '/sign-in', search: {} });
  },
  component: Checkout,
});
