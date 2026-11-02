import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  blockInstallationSchema,
  ListenerDeviceStatus,
  ListenerRevokeReason,
  renameListenerDeviceSchema,
} from '@lytronix/validators';

// LSN-01, LSN-02, LSN-08, LSN-20, LSN-21 (Phase 5 Slice 5.4a): a shop's listener phones, and Lytro's blocks.
export class RenameListenerDeviceDto extends createZodDto(renameListenerDeviceSchema) {}
export class BlockInstallationDto extends createZodDto(blockInstallationSchema) {}

export const listenerDeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  model: z.string().nullable(),
  appVersion: z.string(),
  pairedAt: z.coerce.date(),
  lastSeenAt: z.coerce.date().nullable(),
  online: z.boolean(),
  status: z.nativeEnum(ListenerDeviceStatus),
  revokedAt: z.coerce.date().nullable(),
  revokeReason: z.nativeEnum(ListenerRevokeReason).nullable(),
  flags: z.number(),
});
export class ListenerDeviceDto extends createZodDto(listenerDeviceSchema) {}
export class ListenerDeviceListDto extends createZodDto(
  z.object({
    devices: z.array(listenerDeviceSchema),
    active: z.number(),
    limit: z.number().nullable(),
  }),
) {}
export class ListenerCodeDto extends createZodDto(
  z.object({ code: z.string(), expiresAt: z.coerce.date() }),
) {}
export class InstallationBlockedDto extends createZodDto(z.object({ revoked: z.number() })) {}
