import { createFileRoute, redirect } from '@tanstack/react-router';
import { tenantSession } from '@/session/tenant-session';
import { CreateShop } from '@/views/create-shop';

export const Route = createFileRoute('/create-shop')({
  beforeLoad: async () => {
    await tenantSession.whenReady();
    if (!tenantSession.isSignedIn()) throw redirect({ to: '/sign-in', search: {} });
  },
  component: CreateShop,
});
