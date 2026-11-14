import { z } from 'zod';
import { MONEY_TEXT_MAX_LENGTH } from '../../common/limits';
import { AddressFieldState, PerUsePaidFrom } from '../../db/enums';

// ORD-33: the longest message one read takes.
export const ADDRESS_TEXT_MAX_LENGTH = 4000;

// POST /orders/read-address (ORD-30 to ORD-33, amended 2026-11-06): a customer's message, pasted as text. Only the text
// is taken; a picture is refused before this (ORD-32).
export const readAddressSchema = z
  .object({
    text: z.string().trim().min(1).max(ADDRESS_TEXT_MAX_LENGTH),
  })
  .strict();
export type ReadAddressInput = z.infer<typeof readAddressSchema>;

const fieldState = z.nativeEnum(AddressFieldState);
// SEC-12: a detail is read from the message, so it is never longer than the message.
const readDetail = z.string().max(ADDRESS_TEXT_MAX_LENGTH).nullable();

// ORD-30, ORD-31 (amended 2026-11-06, Slice 7.6's read): the delivery details read from a message, as the order form
// takes them, nothing saved. A zilla and thana are Lytro's own, matched by name; a near match fills the form but is
// marked to check. What was written for a place or a phone that didn't match stays, so staff can see it.
export const addressReadSchema = z.object({
  draft: z.object({
    customerName: readDetail,
    phone: readDetail,
    zillaId: z.number().int().nullable(),
    locationId: z.number().int().nullable(),
    deliveryAddress: readDetail,
    notes: readDetail,
  }),
  fields: z.object({
    customerName: fieldState,
    phone: fieldState,
    zilla: fieldState,
    thana: fieldState,
    deliveryAddress: fieldState,
    notes: fieldState,
  }),
  written: z.object({
    phone: readDetail,
    zilla: readDetail,
    thana: readDetail,
  }),
  // ORD-30: how much of the five details was read and matched, from 0 to 1.
  confidence: z.number(),
  // ORD-34 (amended 2026-11-06): null when nothing was found, and so nothing charged.
  charged: z
    .object({
      paidFrom: z.nativeEnum(PerUsePaidFrom),
      amount: z.string().max(MONEY_TEXT_MAX_LENGTH),
      // PLN-20: the allowance's uses still left, when one paid.
      allowanceLeft: z.number().int().nullable(),
    })
    .nullable(),
});
export type AddressRead = z.infer<typeof addressReadSchema>;
