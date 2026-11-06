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
  assignCourierAreaSchema,
  confirmCourierAreasSchema,
  courierAreasForOrderSchema,
  courierAreasQuerySchema,
  CourierAreaMatch,
  courierPayoutsQuerySchema,
  ParcelReading,
  refreshCourierAreasSchema,
} from '@lytronix/validators';

export class ConnectCourierDto extends createZodDto(connectCourierSchema) {}
export class SetPickupStoreDto extends createZodDto(setPickupStoreSchema) {}
export class CourierAreasQueryDto extends createZodDto(courierAreasQuerySchema) {}
export class AssignCourierAreaDto extends createZodDto(assignCourierAreaSchema) {}
export class ConfirmCourierAreasDto extends createZodDto(confirmCourierAreasSchema) {}
export class RefreshCourierAreasDto extends createZodDto(refreshCourierAreasSchema) {}
export class CourierAreasForOrderDto extends createZodDto(courierAreasForOrderSchema) {}
export class CourierPayoutsQueryDto extends createZodDto(courierPayoutsQuerySchema) {}

// CUS-10 (Slice 6.4): one of a courier's areas, for the operator.
const courierAreaSchema = z.object({
  id: z.string(),
  courierKey: z.nativeEnum(CourierKey),
  areaCode: z.string(),
  name: z.string(),
  districtName: z.string(),
  postCode: z.string().nullable(),
  zillaId: z.number().nullable(),
  thanaId: z.number().nullable(),
  suggestedThanaId: z.number().nullable(),
  match: z.nativeEnum(CourierAreaMatch),
  retiredAt: z.coerce.date().nullable(),
});
export class CourierAreaDto extends createZodDto(courierAreaSchema) {}
export class CourierAreaPageDto extends createZodDto(
  z.object({
    areas: z.array(courierAreaSchema),
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    pages: z.number(),
  }),
) {}
export class CourierAreasConfirmedDto extends createZodDto(z.object({ confirmed: z.number() })) {}
export class CourierAreasRefreshedDto extends createZodDto(
  z.object({
    listed: z.number(),
    added: z.number(),
    renamed: z.number(),
    retired: z.number(),
    back: z.number(),
  }),
) {}
// CUS-12: what staff can choose for an order, the thana's areas first.
const areaChoiceSchema = z.object({
  areaCode: z.string(),
  name: z.string(),
  suggested: z.boolean(),
});
export class CourierAreaChoicesDto extends createZodDto(
  z.object({ thana: z.array(areaChoiceSchema), zilla: z.array(areaChoiceSchema) }),
) {}
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

// CRR-17 (Slice 6.5): a payout a courier made the shop, its figures as the courier gave them.
const courierPayoutSchema = z.object({
  id: z.string(),
  courierKey: z.nativeEnum(CourierKey),
  payoutId: z.string(),
  amount: z.string(),
  charges: z.string().nullable(),
  total: z.string().nullable(),
  method: z.string().nullable(),
  paidAt: z.coerce.date(),
  madeAt: z.coerce.date().nullable(),
  parcels: z.number(),
  ours: z.number(),
});

export class CourierPayoutListDto extends createZodDto(
  z.object({
    payouts: z.array(courierPayoutSchema),
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    pages: z.number(),
  }),
) {}

// CRR-17 (Slice 6.5): one payout and the shop's orders it settled; no courier gives an amount for one parcel.
export class CourierPayoutDto extends createZodDto(
  courierPayoutSchema.extend({
    orders: z.array(
      z.object({
        orderId: z.string(),
        orderNumber: z.string().nullable(),
        cod: z.string(),
        cashCollected: z.string().nullable(),
        deliveryCharge: z.string().nullable(),
        reading: z.nativeEnum(ParcelReading).nullable(),
      }),
    ),
  }),
) {}
