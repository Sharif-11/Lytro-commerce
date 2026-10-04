import { z } from 'zod';

// AUTH-01: shop name and owner name, up to 60 characters each.
export const NAME_MAX_LENGTH = 60;
// AUTH-05: six-digit one-time code.
export const CODE_PATTERN = /^\d{6}$/;

export const requestCodeSchema = z.object({
  phone: z.string().max(30),
});

export const completeSignupSchema = z.object({
  phone: z.string().max(30),
  code: z.string().regex(CODE_PATTERN, 'six digits'),
  ownerName: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  shopName: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  address: z.string().max(60).optional(),
});

export type RequestCodeInput = z.infer<typeof requestCodeSchema>;
export type CompleteSignupInput = z.infer<typeof completeSignupSchema>;
