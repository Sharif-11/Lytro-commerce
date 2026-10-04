import { z } from 'zod';
import { NAME_MAX_LENGTH, SLUG_MAX_LENGTH } from '../../../common/limits';
import { codeField, phoneField } from './phone-signup-common';

// The `-create` suffix holds the body that creates a shop from a verified phone (AUTH-01, AUTH-10).
export const completeSignupSchema = z.object({
  phone: phoneField,
  code: codeField,
  ownerName: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  shopName: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  address: z.string().max(SLUG_MAX_LENGTH).optional(),
});

export type CompleteSignupInput = z.infer<typeof completeSignupSchema>;
