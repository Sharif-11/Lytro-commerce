import { suspendTenantSchema } from './tenant-suspend';
import { z } from 'zod';

// PATCH /operator/settings/:key (LIF-26): the value's real shape depends on the key (validated per-key in
// PlatformSettingsService) -- this schema only accepts a JSON scalar, a list of strings (LSN-16's senders) or an object
// of numbers (D8-60's Cloudflare prices), so the DTO never needs updating when a new key with one of those shapes is added.
export const updateSettingSchema = z.object({
  value: z.union([
    z.number(),
    z.string(),
    z.boolean(),
    z.array(z.string()),
    z.record(z.string(), z.number()),
  ]),
  // ADM-11: the reason goes on the platform audit log with the change.
  reason: suspendTenantSchema.shape.reason,
});
export type UpdateSettingInput = z.infer<typeof updateSettingSchema>;
