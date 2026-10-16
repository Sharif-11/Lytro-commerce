import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { SignIn } from '@/views/sign-in';

// D2-12: a Buy button on the marketing site links here with the chosen plan/term, e.g.
// /sign-in?planId=...&termId=... — optional, since every ordinary sign-in omits both.
const searchSchema = z.object({
  planId: z.string().uuid().optional(),
  termId: z.string().uuid().optional(),
});

export const Route = createFileRoute('/sign-in')({
  validateSearch: searchSchema,
  component: SignIn,
});
