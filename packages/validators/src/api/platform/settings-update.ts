import { z } from 'zod';

// PATCH /operator/settings/:key (LIF-26): the value's real shape depends on the key (validated per-key in
// PlatformSettingsService) -- this schema only accepts a JSON scalar, so the DTO never needs updating when a
// new key with a different value shape is added.
export const updateSettingSchema = z.object({
  value: z.union([z.number(), z.string(), z.boolean()]),
});
export type UpdateSettingInput = z.infer<typeof updateSettingSchema>;
