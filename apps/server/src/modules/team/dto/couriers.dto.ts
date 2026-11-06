import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  bookOrderSchema,
  cancelParcelSchema,
  connectCourierSchema,
  CourierCallAction,
  CourierConnectionState,
  CourierKey,
  CourierMessagesState,
  setPickupStoreSchema,
  settleParcelSchema,
} from '@lytronix/validators';

export class ConnectCourierDto extends createZodDto(connectCourierSchema) {}
export class SetPickupStoreDto extends createZodDto(setPickupStoreSchema) {}
export class BookOrderDto extends createZodDto(bookOrderSchema) {}
export class SettleParcelDto extends createZodDto(settleParcelSchema) {}
export class CancelParcelDto extends createZodDto(cancelParcelSchema) {}

// CRR-01.
export class CourierAdapterListDto extends createZodDto(
  z.object({
    adapters: z.array(
      z.object({
        key: z.nativeEnum(CourierKey),
        name: z.string(),
        credentialFields: z.array(z.string()),
        needsArea: z.boolean(),
        needsThana: z.boolean(),
        hasStores: z.boolean(),
        takesWeight: z.boolean(),
        canCancel: z.boolean(),
      }),
    ),
  }),
) {}

// CRR-03: whether it has credentials, never what they are.
const courierConnectionSchema = z.object({
  courierKey: z.nativeEnum(CourierKey),
  name: z.string(),
  isDefault: z.boolean(),
  hasCredentials: z.literal(true),
  state: z.nativeEnum(CourierConnectionState),
  connectedAt: z.coerce.date(),
  messages: z.nativeEnum(CourierMessagesState),
  lastMessageAt: z.coerce.date().nullable(),
  pickupStore: z.object({ id: z.string(), name: z.string() }).nullable(),
});
export class CourierConnectionDto extends createZodDto(courierConnectionSchema) {}
// CRR-02, CRR-03: what a seller pastes into the courier's panel; Lytro's own, not the courier's credentials.
const messageAddressSchema = z.object({ address: z.string(), token: z.string() });
export class MessageAddressDto extends createZodDto(messageAddressSchema) {}
export class CourierConnectedDto extends createZodDto(
  courierConnectionSchema.extend({ message: messageAddressSchema }),
) {}
export class CourierConnectionListDto extends createZodDto(
  z.object({ connections: z.array(courierConnectionSchema) }),
) {}

// Slice 6.3, read agreed 2026-11-05: the stores a courier lists for this account, and which is chosen.
export class CourierStoreListDto extends createZodDto(
  z.object({
    stores: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        address: z.string().nullable(),
        active: z.boolean(),
      }),
    ),
    chosenId: z.string().nullable(),
  }),
) {}

// SEC-11: a shop's log of its courier credentials' uses, for the operator.
export class CourierCredentialUsePageDto extends createZodDto(
  z.object({
    uses: z.array(
      z.object({
        courierKey: z.nativeEnum(CourierKey),
        action: z.nativeEnum(CourierCallAction),
        connectionId: z.string().nullable(),
        orderId: z.string().nullable(),
        succeeded: z.boolean(),
        at: z.coerce.date(),
      }),
    ),
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    pages: z.number(),
  }),
) {}
