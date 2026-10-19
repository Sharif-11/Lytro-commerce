import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { SignIn } from '@/views/sign-in';

// The marketing site links here with what the guest chose there: the claim box's address (`?shop=`) and a
// plan picked on pricing (`?planId=&termId=`), all optional (AUTH-28, AUTH-29).
const searchSchema = z.object({
  shop: z.string().optional(),
  planId: z.string().uuid().optional(),
  termId: z.string().uuid().optional(),
});

export const Route = createFileRoute('/sign-in')({
  validateSearch: searchSchema,
  component: SignIn,
});
