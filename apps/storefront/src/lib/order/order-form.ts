import {
  bdMobileNumber,
  CUSTOMER_NAME_MAX_LENGTH,
  ORDER_ADDRESS_MAX_LENGTH,
  SHOPPER_NOTE_MAX_LENGTH,
} from '@lytronix/validators/common';
import { StockUnit } from '@lytronix/validators/enums';
import type { OrderInput, OrderItemInput, PlacedOrder } from '../api/storefront-api';
import type { Words } from '../i18n/words';

// SFT-06, LND-07, LND-09 (Slice 4.8e): the fields a shopper's order takes, and what the server's answer to it means. The
// server checks everything again (ORD-02); these checks only spare the shopper a counted request (RTE-06).

export const NAME_MAX = CUSTOMER_NAME_MAX_LENGTH;
export const ADDRESS_MAX = ORDER_ADDRESS_MAX_LENGTH;
export const NOTE_MAX = SHOPPER_NOTE_MAX_LENGTH;

export interface OrderFields {
  customerName: string;
  phone: string;
  thanaId: number | null;
  deliveryAddress: string;
  shopperNote: string;
}

export type OrderFieldName = 'customerName' | 'phone' | 'locationId' | 'deliveryAddress';

export const NO_FIELDS: OrderFields = {
  customerName: '',
  phone: '',
  thanaId: null,
  deliveryAddress: '',
  shopperNote: '',
};

/** The fields to fix, in the order the form shows them. */
export function orderFieldProblems(fields: OrderFields): OrderFieldName[] {
  const problems: OrderFieldName[] = [];
  if (fields.customerName.trim() === '') problems.push('customerName');
  if (bdMobileNumber(fields.phone) === null) problems.push('phone');
  if (fields.thanaId === null) problems.push('locationId');
  if (fields.deliveryAddress.trim() === '') problems.push('deliveryAddress');
  return problems;
}

/** The order as the public endpoint takes it. */
export function orderBody(
  fields: OrderFields,
  items: OrderItemInput[],
  source: 'storefront' | 'landing_page',
  payment?: OrderInput['payment'],
): OrderInput {
  const note = fields.shopperNote.trim();
  return {
    customerName: fields.customerName.trim(),
    phone: fields.phone.trim(),
    locationId: fields.thanaId ?? 0,
    deliveryAddress: fields.deliveryAddress.trim(),
    ...(note === '' ? {} : { shopperNote: note }),
    source,
    items,
    ...(payment ? { payment } : {}),
  };
}

/** What became of an order sent. */
export type OrderOutcome =
  | { kind: 'placed'; order: PlacedOrder }
  /** Fields the server refused, which the form shows as it shows its own. */
  | { kind: 'fields'; fields: OrderFieldName[] }
  /** An item's add-ons or choices no longer fit, or something the shopper cannot change here: the check tells which. */
  | { kind: 'recheck' }
  /** An item is sold out or no longer sold (PRD-06, PRD-07, ATR-07); nothing was placed. */
  | { kind: 'sold_out'; variantId: string | null }
  /** The shop or a product does not deliver to the thana (DLV-06, DLV-07). */
  | { kind: 'no_delivery' }
  /** The way of paying chosen isn't offered any more (WAL-06). */
  | { kind: 'advance' }
  /** The shop has no way to be paid now, and the order needs one (PRD-08). */
  | { kind: 'no_method' }
  /** A new shop past its day's online payments (TVR-04). */
  | { kind: 'cap' }
  /** Too many tries (RTE-06, RTE-08). */
  | { kind: 'busy' }
  /** D9-14 (Slice 9.9): orders can't be saved for a few minutes; nothing was placed, and the same key tries again later. */
  | { kind: 'paused' }
  /** It may not have arrived: the same key tried again makes one order (SFT-06). */
  | { kind: 'failed' }
  /** The same key was already spent on a different order: a new try needs a new key. */
  | { kind: 'key_spent' };

/** What the storefront's own route passes back of the server's answer. */
export interface OrderAnswer {
  data?: unknown;
  code?: string | null;
  details?: Record<string, unknown>;
}

const OUR_FIELDS: readonly string[] = ['customerName', 'phone', 'locationId', 'deliveryAddress'];

function refusedFields(details: Record<string, unknown>): { field: string }[] {
  const fields = details['fields'];
  return Array.isArray(fields) ? (fields as { field: string }[]) : [];
}

/** Reads the answer to an order sent. */
export function readOrderAnswer(status: number, answer: OrderAnswer | null): OrderOutcome {
  if (status === 201 || status === 200) {
    return answer?.data
      ? { kind: 'placed', order: answer.data as PlacedOrder }
      : { kind: 'failed' };
  }
  const code = answer?.code ?? null;
  const details = answer?.details ?? {};
  if (status === 429) return { kind: 'busy' };
  // Only the server's own "changes can't be saved" says paused; every other 503 may or may not have reached it.
  if (status === 503 && code === 'service_unavailable' && details['savingPaused'] === true) {
    return { kind: 'paused' };
  }
  if (code === 'idempotency_conflict') return { kind: 'key_spent' };
  if (status >= 500 || answer === null) return { kind: 'failed' };
  const fields = refusedFields(details);
  if (fields.length > 0) {
    const named = fields.map((row) => row.field);
    if (named.some((field) => field.startsWith('payment'))) return { kind: 'advance' };
    const ours = named.filter((field) => OUR_FIELDS.includes(field)) as OrderFieldName[];
    return ours.length > 0 ? { kind: 'fields', fields: ours } : { kind: 'recheck' };
  }
  if (code === 'conflict') {
    const reason = details['reason'];
    if (reason === 'no_payment_method') return { kind: 'no_method' };
    if (reason === 'new_shop_cap') return { kind: 'cap' };
    if (reason === 'zone_no_delivery' || reason === 'product_not_delivered_here') {
      return { kind: 'no_delivery' };
    }
    const variantId = details['variantId'];
    return { kind: 'sold_out', variantId: typeof variantId === 'string' ? variantId : null };
  }
  return { kind: 'failed' };
}

/** The window of the browser's session where a placed order's phone is kept, for its confirmation page only (ORD-17: the
    server never gives a phone back). */
export const placedPhoneKey = (trackingId: string): string => `lytro-placed-${trackingId}`;
/** SFT-14: this phone has ordered from this shop, so the install card may offer itself. */
export const ORDERED_KEY = 'lytro-ordered';

/** UOM-05 (PD-19): the units a quantity is said in, a measure's (`× 1.5 কেজি`) and a count's (`× 1 পিস`) alike. */
/** A cart line's quantity, with its unit; a line from before units were kept is in pieces (LND-07). */
export const lineQuantityText = (
  line: { quantity: number; stockUnit?: StockUnit },
  words: Words,
): string => quantityText(line.quantity, line.stockUnit ?? StockUnit.Piece, words);

export function quantityText(quantity: string | number, unit: StockUnit, words: Words): string {
  const amount = String(Number(quantity));
  switch (unit) {
    case StockUnit.Kg:
      return `${amount} ${words.t('unit_kg')}`;
    case StockUnit.G:
      return `${amount} ${words.t('unit_g')}`;
    case StockUnit.Liter:
      return `${amount} ${words.t('unit_l')}`;
    case StockUnit.Ml:
      return `${amount} ${words.t('unit_ml')}`;
    case StockUnit.Piece:
    case StockUnit.Dozen:
    case StockUnit.Pack:
    case StockUnit.Box:
      return `${amount} ${countWord(unit, Number(quantity), words)}`;
  }
}

/** UOM-05 (PD-19): a counted unit's word for a number of them: "1 piece", "2 pieces", in Bangla one word ("পিস"). */
export function countWord(
  unit: StockUnit.Piece | StockUnit.Dozen | StockUnit.Pack | StockUnit.Box,
  count: number,
  words: Words,
): string {
  const one = count === 1;
  switch (unit) {
    case StockUnit.Piece:
      return words.t(one ? 'u_piece' : 'u_pieces');
    case StockUnit.Dozen:
      return words.t(one ? 'u_dozen' : 'u_dozens');
    case StockUnit.Pack:
      return words.t(one ? 'u_pack' : 'u_packs');
    case StockUnit.Box:
      return words.t(one ? 'u_box' : 'u_boxes');
  }
}
