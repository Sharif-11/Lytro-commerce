import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  blockInstallationSchema,
  CredentialUseAction,
  ListenerDeviceStatus,
  ListenerIgnoredReason,
  ListenerMessageStatus,
  listenerReceiptsQuerySchema,
  ListenerRevokeReason,
  listenerUnreadQuerySchema,
  PaymentMethod,
  PaymentReviewReason,
  renameListenerDeviceSchema,
  coercedDateField,
} from '@lytronix/validators';

// LSN-01, LSN-02, LSN-08, LSN-20, LSN-21 (Phase 5 Slice 5.4a): a shop's listener phones, and Lytro's blocks.
export class RenameListenerDeviceDto extends createZodDto(renameListenerDeviceSchema) {}
export class BlockInstallationDto extends createZodDto(blockInstallationSchema) {}

export const listenerDeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  model: z.string().nullable(),
  appVersion: z.string(),
  pairedAt: coercedDateField(),
  lastSeenAt: coercedDateField().nullable(),
  online: z.boolean(),
  status: z.enum(ListenerDeviceStatus),
  revokedAt: coercedDateField().nullable(),
  revokeReason: z.enum(ListenerRevokeReason).nullable(),
  flags: z.number(),
  uploadsToday: z.number(),
});
export class ListenerDeviceDto extends createZodDto(listenerDeviceSchema) {}
// LSN-21: blocking an installation needs its id, which only the operator reads.
export class OperatorListenerDeviceListDto extends createZodDto(
  z.object({
    devices: z.array(listenerDeviceSchema.extend({ installationId: z.string() })),
    active: z.number(),
    limit: z.number().nullable(),
  }),
) {}
export class ListenerDeviceListDto extends createZodDto(
  z.object({
    devices: z.array(listenerDeviceSchema),
    active: z.number(),
    limit: z.number().nullable(),
  }),
) {}
export class ListenerCodeDto extends createZodDto(
  z.object({ code: z.string(), expiresAt: coercedDateField() }),
) {}
// Agreed 2026-11-02 (Slice 5.4b read): the receipts staff list and search; VER-06: what Lytro reads of the unreadable.
export class ListenerReceiptsQueryDto extends createZodDto(listenerReceiptsQuerySchema) {}
export class ListenerUnreadQueryDto extends createZodDto(listenerUnreadQuerySchema) {}
export class ReceiptPageDto extends createZodDto(
  z.object({
    receipts: z.array(
      z.object({
        id: z.string(),
        method: z.enum(PaymentMethod).nullable(),
        amount: z.string().nullable(),
        transactionId: z.string().nullable(),
        status: z.enum(ListenerMessageStatus),
        reviewReason: z.enum(PaymentReviewReason).nullable(),
        ignoredReason: z.enum(ListenerIgnoredReason).nullable(),
        orderNumber: z.string().nullable(),
        receivedAt: coercedDateField(),
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
  method: z.enum(PaymentMethod).nullable(),
  amount: z.string().nullable(),
  transactionId: z.string().nullable(),
  status: z.enum(ListenerMessageStatus),
  reviewReason: z.enum(PaymentReviewReason).nullable(),
  ignoredReason: z.enum(ListenerIgnoredReason).nullable(),
  orderNumber: z.string().nullable(),
  receivedAt: coercedDateField(),
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
// SEC-11 (Slice 5.7): a shop's log of its stored gateway credentials' uses.
export class CredentialUsePageDto extends createZodDto(
  z.object({
    uses: z.array(
      z.object({
        method: z.enum(PaymentMethod),
        action: z.enum(CredentialUseAction),
        accountId: z.string(),
        sessionId: z.string().nullable(),
        succeeded: z.boolean(),
        at: coercedDateField(),
      }),
    ),
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
