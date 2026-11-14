import { suspendTenantSchema } from './tenant-suspend';
import { z } from 'zod';
import { RECORD_KEY_MAX_LENGTH } from '../../common/limits';

// SEC-12: the longest text a setting takes. The longest any holds today is the VAT seller's address
// (VAT_SELLER_ADDRESS_MAX); each key's own check bounds it again.
const SETTING_TEXT_MAX_LENGTH = 2000;

// PATCH /operator/settings/:key (LIF-26): the value's real shape depends on the key (validated per-key in
// PlatformSettingsService) -- this schema only accepts a JSON scalar, a list of strings (LSN-16's senders) or an object
// of numbers (D8-60's Cloudflare prices), so the DTO never needs updating when a new key with one of those shapes is added.
export const updateSettingSchema = z.object({
  value: z.union([
    z.number(),
    z.string().max(SETTING_TEXT_MAX_LENGTH),
    z.boolean(),
    z.array(z.string().max(SETTING_TEXT_MAX_LENGTH)),
    z.record(z.string().max(RECORD_KEY_MAX_LENGTH), z.number()),
  ]),
  // ADM-11: the reason goes on the platform audit log with the change.
  reason: suspendTenantSchema.shape.reason,
});
export type UpdateSettingInput = z.infer<typeof updateSettingSchema>;
