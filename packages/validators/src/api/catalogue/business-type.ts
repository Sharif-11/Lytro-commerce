import { z } from 'zod';

// PUT business-type (PST-01): the shop's main business type, a preset key, or null to clear it. Which keys exist
// is platform data the operator can change (PST-04), so the server checks the key against the presets.
export const setBusinessTypeSchema = z.object({
  businessType: z.string().trim().min(1).max(40).nullable(),
});
export type SetBusinessTypeInput = z.infer<typeof setBusinessTypeSchema>;
