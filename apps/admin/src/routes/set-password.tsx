import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { tenantSession } from '@/session/tenant-session';
import { SetPassword } from '@/views/set-password';

const searchSchema = z.object({
  // true when a password is mandatory to proceed (the forgot-password flow's must_set_password session,
  // AUTH-19) — false when it's the optional step after create-shop (AUTH-28), where "Skip" is offered.
  required: z.boolean(),
});

export const Route = createFileRoute('/set-password')({
  validateSearch: searchSchema,
  beforeLoad: () => {
    if (!tenantSession.isSignedIn()) throw redirect({ to: '/sign-in' });
  },
  component: SetPassword,
});
