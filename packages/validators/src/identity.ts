import { z } from 'zod';
import { CODE_PATTERN, NAME_MAX_LENGTH, SLUG_MAX_LENGTH } from './limits';

export const requestCodeSchema = z.object({
  phone: z.string().max(30),
});

export const completeSignupSchema = z.object({
  phone: z.string().max(30),
  code: z.string().regex(CODE_PATTERN, 'six digits'),
  ownerName: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  shopName: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  address: z.string().max(SLUG_MAX_LENGTH).optional(),
});

export type RequestCodeInput = z.infer<typeof requestCodeSchema>;
export type CompleteSignupInput = z.infer<typeof completeSignupSchema>;
