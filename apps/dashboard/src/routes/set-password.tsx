import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { tenantSession } from '@/session/tenant-session';
import { SetPassword } from '@/views/set-password';

const searchSchema = z.object({
  // true when a password must be set to proceed (a must_set_password session, AUTH-19); false for the
  // optional step after create-shop (AUTH-28 step 3), where "Skip for now" is offered.
  required: z.boolean().catch(false),
});

export const Route = createFileRoute('/set-password')({
  validateSearch: searchSchema,
  beforeLoad: async () => {
    await tenantSession.whenReady();
    if (!tenantSession.isSignedIn()) throw redirect({ to: '/sign-in', search: {} });
  },
  component: SetPassword,
});
