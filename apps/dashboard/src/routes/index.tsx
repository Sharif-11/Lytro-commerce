import { createFileRoute, redirect } from '@tanstack/react-router';
import { tenantSession } from '@/session/tenant-session';

// app.lytro.app/: a signed-in person goes to their shop (via /shops, which reads /me); anyone else to the one
// entry door (AUTH-12).
export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    await tenantSession.whenReady();
    throw redirect({ to: tenantSession.isSignedIn() ? '/shops' : '/sign-in', search: {} });
  },
});
