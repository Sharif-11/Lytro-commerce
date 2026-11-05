import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  bookOrderSchema,
  cancelParcelSchema,
  connectCourierSchema,
  CourierCallAction,
  CourierConnectionState,
  CourierKey,
  settleParcelSchema,
} from '@lytronix/validators';

export class ConnectCourierDto extends createZodDto(connectCourierSchema) {}
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
});
export class CourierConnectionDto extends createZodDto(courierConnectionSchema) {}
export class CourierConnectionListDto extends createZodDto(
  z.object({ connections: z.array(courierConnectionSchema) }),
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
