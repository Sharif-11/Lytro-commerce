import { z } from 'zod';

// BIL-02/BAL-03: the platform's own wallet numbers. `number` is a plain string, not the stricter
// subscriber-identity phone pipeline (PhoneNumberFormat) -- a wallet number has no OTP or
// uniqueness-across-subscribers constraint, just "something the operator typed correctly".
export const createPlatformWalletSchema = z.object({
  provider: z.string().trim().min(1).max(40),
  number: z.string().trim().min(1).max(20),
  label: z.string().trim().max(100).nullable().optional(),
  enabled: z.boolean().optional(),
  displayOrder: z.coerce.number().int().optional(),
});
export type CreatePlatformWalletInput = z.infer<typeof createPlatformWalletSchema>;

export const updatePlatformWalletSchema = createPlatformWalletSchema.partial();
export type UpdatePlatformWalletInput = z.infer<typeof updatePlatformWalletSchema>;
