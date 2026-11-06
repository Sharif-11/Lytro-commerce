import { z } from 'zod';
import {
  CONSIGNMENT_ID_MAX_LENGTH,
  COURIER_FIELD_MAX_LENGTH,
  PARCEL_NOTE_MAX_LENGTH,
} from '../../common/courier-limits';
import { ORDER_LINES_MAX, TRACKING_CODE_MAX_LENGTH } from '../../common/limits';
import { CourierKey } from '../../db/enums';
import { FieldProblemCode } from '../../validation/field-problem';
import { itemSerialsSchema, serialsOnce } from '../orders/order';

/**
 * CRR-02, CRR-03, SEC-08 (Phase 6 Slice 6.1): a courier's credentials, only ever in a request's body; sealed as they arrive and
 * never returned. Which fields a courier needs is its adapter's to say, so they are checked there. A field left blank when
 * replacing keeps what is saved.
 */
export const connectCourierSchema = z
  .object({
    courierKey: z.nativeEnum(CourierKey),
    credentials: z.record(z.string().trim().max(COURIER_FIELD_MAX_LENGTH)),
  })
  .strict();
export type ConnectCourierInput = z.infer<typeof connectCourierSchema>;

/**
 * PUT couriers/connections/:key/store (Phase 6 Slice 6.3, read agreed 2026-11-05): the one store a shop's parcels leave from, for a
 * courier that has stores. It must be one the courier lists as active for this account.
 */
export const setPickupStoreSchema = z
  .object({ storeId: z.string().trim().min(1).max(COURIER_FIELD_MAX_LENGTH) })
  .strict();
export type SetPickupStoreInput = z.infer<typeof setPickupStoreSchema>;

/**
 * POST orders/:id/book (CRR-05, CRR-06, D6-7, read agreed 2026-11-04): what staff choose when booking. The cash on delivery is
 * not here: it is always what the order says is due. Left out, `courierKey` is the shop's default courier. Weight and area
 * count only where the courier takes them.
 */
export const bookOrderSchema = z
  .object({
    courierKey: z.nativeEnum(CourierKey).optional(),
    note: z.string().trim().min(1).max(PARCEL_NOTE_MAX_LENGTH).optional(),
    weightKg: z.number().positive().max(1000).optional(),
    areaCode: z.string().trim().min(1).max(COURIER_FIELD_MAX_LENGTH).optional(),
    serials: z.array(itemSerialsSchema).max(ORDER_LINES_MAX).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    serialsOnce(value.serials, ctx, 'serials');
  });
export type BookOrderInput = z.infer<typeof bookOrderSchema>;

/**
 * POST orders/:id/parcel/settle (D6-11, CRR-18): staff settle a booking. `booked` and `not_booked` answer a lost answer from the
 * courier's panel; `retry` finishes a parcel the courier accepted whose stock could not be taken at the time.
 */
export const settleParcelSchema = z
  .object({
    outcome: z.enum(['booked', 'not_booked', 'retry']),
    consignmentId: z.string().trim().min(1).max(CONSIGNMENT_ID_MAX_LENGTH).optional(),
    trackingCode: z.string().trim().min(1).max(TRACKING_CODE_MAX_LENGTH).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.outcome === 'booked' && value.consignmentId === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['consignmentId'],
        message: 'Required.',
        params: { problem: FieldProblemCode.Required },
      });
    }
  });
export type SettleParcelInput = z.infer<typeof settleParcelSchema>;

/**
 * POST orders/:id/parcel/cancel (QTA-01, read agreed 2026-11-04): only the booking is called off and the order stays, to be booked
 * again or marked shipped by hand. Where the courier has no cancel call, staff confirm they did it in its panel (CRR-28).
 */
export const cancelParcelSchema = z.object({ courierCancelled: z.boolean().optional() }).strict();
export type CancelParcelInput = z.infer<typeof cancelParcelSchema>;
