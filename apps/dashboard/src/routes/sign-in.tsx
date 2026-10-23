import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { SignIn } from '@/views/sign-in';

// The marketing site links here with what the guest chose there: the claim box's address (`?shop=`) and a
// plan picked on pricing (`?planId=&termId=`), all optional (AUTH-28, AUTH-29). The verify screen's "use a
// password instead" opens password mode with the number it already has (`?mode=password&phone=`).
const searchSchema = z.object({
  shop: z.string().optional(),
  planId: z.string().uuid().optional(),
  termId: z.string().uuid().optional(),
  mode: z.enum(['code', 'password']).optional(),
  phone: z.string().optional(),
});

export const Route = createFileRoute('/sign-in')({
  validateSearch: searchSchema,
  component: SignIn,
});
