import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  blockInstallationSchema,
  ListenerDeviceStatus,
  ListenerIgnoredReason,
  ListenerMessageStatus,
  listenerReceiptsQuerySchema,
  ListenerRevokeReason,
  listenerUnreadQuerySchema,
  PaymentMethod,
  PaymentReviewReason,
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
  uploadsToday: z.number(),
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
// Agreed 2026-11-02 (Slice 5.4b read): the receipts staff list and search; VER-06: what Lytro reads of the unreadable.
export class ListenerReceiptsQueryDto extends createZodDto(listenerReceiptsQuerySchema) {}
export class ListenerUnreadQueryDto extends createZodDto(listenerUnreadQuerySchema) {}
export class ReceiptPageDto extends createZodDto(
  z.object({
    receipts: z.array(
      z.object({
        id: z.string(),
        method: z.nativeEnum(PaymentMethod).nullable(),
        amount: z.string().nullable(),
        transactionId: z.string().nullable(),
        status: z.nativeEnum(ListenerMessageStatus),
        reviewReason: z.nativeEnum(PaymentReviewReason).nullable(),
        ignoredReason: z.nativeEnum(ListenerIgnoredReason).nullable(),
        orderNumber: z.string().nullable(),
        receivedAt: z.coerce.date(),
        senderNumber: z.string().nullable(),
        deviceId: z.string(),
        text: z.string().nullable(),
      }),
    ),
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    pages: z.number(),
  }),
) {}
// PAY-21 (Slice 5.6): what Lytro's own phones forwarded, as the operator reads it.
export const lytroReceiptSchema = z.object({
  id: z.string(),
  method: z.nativeEnum(PaymentMethod).nullable(),
  amount: z.string().nullable(),
  transactionId: z.string().nullable(),
  status: z.nativeEnum(ListenerMessageStatus),
  reviewReason: z.nativeEnum(PaymentReviewReason).nullable(),
  ignoredReason: z.nativeEnum(ListenerIgnoredReason).nullable(),
  orderNumber: z.string().nullable(),
  receivedAt: z.coerce.date(),
  senderNumber: z.string().nullable(),
  deviceId: z.string(),
  planPaymentId: z.string().nullable(),
  text: z.string().nullable(),
});
export class LytroReceiptPageDto extends createZodDto(
  z.object({
    receipts: z.array(lytroReceiptSchema),
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    pages: z.number(),
  }),
) {}
export class ListenerUnreadDto extends createZodDto(
  z.object({
    shapes: z.array(z.object({ day: z.string(), shape: z.string(), count: z.number() })),
  }),
) {}
export class InstallationBlockedDto extends createZodDto(z.object({ revoked: z.number() })) {}
