import { createFileRoute, redirect } from '@tanstack/react-router';
import { tenantSession } from '@/session/tenant-session';

// app.lytro.app/: a signed-in person goes to their shop (via /shops, which reads /me); anyone else to the one
// entry door (AUTH-12) -- with the password first, since whoever opens the dashboard itself already has an account
// (Fixes · UI/UX batch 2, item 1.5; /sign-in on its own still opens with the SMS code).
export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    await tenantSession.whenReady();
    if (tenantSession.isSignedIn()) throw redirect({ to: '/shops' });
    throw redirect({ to: '/sign-in', search: { mode: 'password' } });
  },
});
