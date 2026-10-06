import { z } from 'zod';
import { codeField } from '../identity/phone-signup/phone-signup-common';

// Adding a phone or an email to a signed-in account (AUTH-26). Google and Facebook are added through their own flow.
export const addableIdentityKind = z.enum(['phone', 'email']);

// POST me/identities/code — send a code to the number or address being added.
export const addIdentityCodeSchema = z.object({
  kind: addableIdentityKind,
  value: z.string().trim().min(1).max(254),
});
export type AddIdentityCodeInput = z.infer<typeof addIdentityCodeSchema>;

// POST me/identities/verify — check the code and add the identity.
export const verifyAddIdentitySchema = addIdentityCodeSchema.extend({
  code: codeField,
});
export type VerifyAddIdentityInput = z.infer<typeof verifyAddIdentitySchema>;
