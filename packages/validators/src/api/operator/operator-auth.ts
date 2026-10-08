import { z } from 'zod';
import { PASSWORD_MAX_LENGTH } from '../../common/limits';

// ADM-01, D8: the operator console's own account space, separate from subscriber/staff sign-in. Every step
// re-asserts email and password — there is no intermediate "pending enrollment" session to protect separately.
export const operatorEmailField = z.string().trim().max(254).email();
export const operatorPasswordField = z.string().min(1).max(PASSWORD_MAX_LENGTH);
// A TOTP code is always 6 digits; a backup code is a 10-character hex string (see TotpService). One loose
// field covers both — the service tries the TOTP check first, then falls back to the backup-code list.
export const operatorCodeField = z.string().trim().min(6).max(20);

// POST auth/operator/signin — password only. Tells the caller whether to enroll (no confirmed secret yet) or
// verify (already enrolled) next; never opens a session by itself.
export const operatorSigninSchema = z.object({
  email: operatorEmailField,
  password: operatorPasswordField,
});
export type OperatorSigninInput = z.infer<typeof operatorSigninSchema>;

// POST auth/operator/enroll — confirms the first TOTP code against the freshly issued, unconfirmed secret.
export const operatorEnrollSchema = operatorSigninSchema.extend({
  code: operatorCodeField,
});
export type OperatorEnrollInput = z.infer<typeof operatorEnrollSchema>;

// POST auth/operator/verify — a TOTP code or a backup code, for every sign-in once enrollment is confirmed.
export const operatorVerifySchema = operatorSigninSchema.extend({
  code: operatorCodeField,
});
export type OperatorVerifyInput = z.infer<typeof operatorVerifySchema>;
