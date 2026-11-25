import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { tenantSession } from '@/session/tenant-session';
import { SignIn } from '@/views/sign-in';

// The marketing site links here with what the guest chose there: the claim box's address (`?shop=`) and a
// plan picked on pricing (`?planId=&termId=`), all optional (AUTH-28, AUTH-29). The verify screen's "use a
// password instead" opens password mode with the number it already has (`?mode=password&phone=`).
const searchSchema = z.object({
  shop: z.string().optional(),
  planId: z.guid().optional(),
  termId: z.guid().optional(),
  mode: z.enum(['code', 'password']).optional(),
  phone: z.string().optional(),
});

export const Route = createFileRoute('/sign-in')({
  validateSearch: searchSchema,
  // §7.1a (the owner, 2026-11-26): someone still signed in -- lytro.app's লগইন or ফ্রি দোকান খুলুন tapped again, the ad
  // opened again in Facebook's browser -- goes to their shop, as app.lytro.app/ does. A plan picked on pricing, or an
  // address claimed on lytro.app, still goes on as before.
  beforeLoad: async ({ search }) => {
    if (search.planId || search.shop) return;
    await tenantSession.whenReady();
    if (tenantSession.isSignedIn()) throw redirect({ to: '/shops' });
  },
  component: SignIn,
});
