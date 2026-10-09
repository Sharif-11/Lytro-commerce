import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { ForgotPasswordVerify } from '@/views/forgot-password/verify';

const searchSchema = z.object({
  phone: z.string(),
  expiresInSeconds: z.number(),
  resendAfterSeconds: z.number(),
});

export const Route = createFileRoute('/forgot-password/verify')({
  validateSearch: searchSchema,
  component: ForgotPasswordVerify,
});
