import { z } from 'zod';
import { CODE_PATTERN } from '../../../common/limits';

// Shared pieces of the sign-up API: the phone field and the request-code action (ENGINEERING §4, the `-common`
// suffix holds fragments and action bodies that more than one endpoint uses).

export const phoneField = z.string().max(30);

export const requestCodeSchema = z.object({
  phone: phoneField,
});

export const codeField = z.string().regex(CODE_PATTERN, 'six digits');

export type RequestCodeInput = z.infer<typeof requestCodeSchema>;
