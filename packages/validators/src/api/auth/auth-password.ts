import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../common/limits';

// POST auth/signin — sign in with identifier + password (AUTH-13).
export const passwordSigninSchema = z.object({
  phone: z.string().max(30),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type PasswordSigninInput = z.infer<typeof passwordSigninSchema>;

// POST auth/password — set or change the password (AUTH-20, D2).
export const setPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(
      PASSWORD_MIN_LENGTH,
      `Password must be at least ${String(PASSWORD_MIN_LENGTH)} characters.`,
    )
    .max(
      PASSWORD_MAX_LENGTH,
      `Password must be at most ${String(PASSWORD_MAX_LENGTH)} characters.`,
    ),
  currentPassword: z.string().max(PASSWORD_MAX_LENGTH).optional(),
});
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
