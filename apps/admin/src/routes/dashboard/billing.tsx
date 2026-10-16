import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { Billing } from '@/views/billing';

// D2-12: a fresh owner who arrived with a plan intent lands here pre-filled, carrying the choice from
// create-shop's own redirect — optional, since every ordinary visit to this page omits both.
const searchSchema = z.object({
  planId: z.string().uuid().optional(),
  termId: z.string().uuid().optional(),
});

export const Route = createFileRoute('/dashboard/billing')({
  validateSearch: searchSchema,
  component: Billing,
});
