import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { VerifyCode } from '@/views/verify-code';

const searchSchema = z.object({
  phone: z.string(),
  expiresInSeconds: z.number(),
  resendAfterSeconds: z.number(),
});

export const Route = createFileRoute('/verify-code')({
  validateSearch: searchSchema,
  component: VerifyCode,
});
