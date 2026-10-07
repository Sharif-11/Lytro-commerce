import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../../common/limits';

const newPasswordField = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

// POST staff/:id/password: the owner sets a new password for a staff member (STF-13).
export const resetStaffPasswordSchema = z.object({
  newPassword: newPasswordField,
});
export type ResetStaffPasswordInput = z.infer<typeof resetStaffPasswordSchema>;

// POST auth/staff/password: a staff member changes their own password. The current one is needed unless the owner
// has asked for a change at the next sign-in.
export const changeStaffPasswordSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH).optional(),
  newPassword: newPasswordField,
});
export type ChangeStaffPasswordInput = z.infer<typeof changeStaffPasswordSchema>;
