import {
  FulfilmentType,
  OrderStatus,
  PaymentMethod,
  type UpdateOrderInput,
} from '@lytronix/validators';
import type { OrderBody } from '@/api/orders';
import { bangladeshiPhone } from '@/lib/phone';
import type { Order, OrderItem } from '@/types/orders';

/** One line of New order or Edit order, as it shows and as it is sent (ORD-01, ORD-06, ORD-11). */
export interface DraftLine {
  /** Its own key on the page: the line's id once saved, a fresh one while new. */
  key: string;
  /** ORD-11: a line the order already has, keeping the price it was ordered at unless set again. */
  lineId: string | null;
  variantId: string;
  productName: string;
  /** The variant's options ("L · Black"); empty for a product's one variant. */
  label: string;
  combo: boolean;
  /** The variant's own price, as the line shows it; the list price for a saved line. */
  base: string;
  /** Each one's price: the variant's with its add-ons; the price ordered at for a saved line. */
  price: string;
  /** ORD-06: the price for each set by hand, or null. */
  byHand: string | null;
  quantity: number;
  /** The units it had on sale when picked; null when nothing limits it or it was not picked here. */
  available: string | null;
  /** CMB-03: a combo's choice parts, a variant for each unit of one combo. */
  choices: { part: number; variantIds: string[] }[] | null;
  /** What was chosen, as the line says it ("Cotton panjabi · M, Check lungi"). */
  choiceText: string | null;
  /** MNU-02: the options chosen in each add-on group. */
  modifiers: { groupId: string; optionIds: string[] }[] | null;
  /** The add-ons, as the line says them ("Gift wrap +৳50"). */
  modifierText: string | null;
}

/** The whole form: who it is for, how it reaches them, the items, then the money and the note. */
export interface OrderDraft {
  /** The number after +880, as typed. */
  phone: string;
  name: string;
  type: FulfilmentType;
  locationId: number | null;
  address: string;
  table: string;
  lines: DraftLine[];
  discount: string;
  byHand: boolean;
  charge: string;
  /** ORD-22: something the customer paid already, with its details. */
  paid: boolean;
  method: PaymentMethod;
  amount: string;
  trxId: string;
  sender: string;
  /** ORD-07: confirmed on the phone as it was taken. */
  confirmed: boolean;
  note: string;
}

export const EMPTY_DRAFT: OrderDraft = {
  phone: '',
  name: '',
  type: FulfilmentType.Delivery,
  locationId: null,
  address: '',
  table: '',
  lines: [],
  discount: '0',
  byHand: false,
  charge: '',
  paid: false,
  method: PaymentMethod.Bkash,
  amount: '',
  trxId: '',
  sender: '',
  confirmed: false,
  note: '',
};

/** A typed amount in taka: a number of at most two decimals, or null. */
const AMOUNT = /^\d+(\.\d{1,2})?$/;
export const amountOf = (typed: string): number | null =>
  AMOUNT.test(typed.trim()) ? Number(typed.trim()) : null;

/** The whole number typed after +880, in its local form (01XXXXXXXXX), or null until it is one. */
export function phoneOf(typed: string): string | null {
  const full = bangladeshiPhone.fromLocalPart(typed);
  return bangladeshiPhone.isValid(full) ? `0${full.slice(4)}` : null;
}

/** Text typed, trimmed, or left out when blank. */
const textOf = (typed: string): string | undefined => typed.trim() || undefined;

/** A line as sent: a saved one by its id with the price it was ordered at, unless set again; a new one in full. */
function itemOf(line: DraftLine, quoting: boolean) {
  const byHand = line.byHand === null ? null : amountOf(line.byHand);
  if (line.lineId !== null) {
    return {
      ...(quoting ? {} : { lineId: line.lineId }),
      variantId: line.variantId,
      quantity: line.quantity,
      // A quote has no saved line, so it is told the price kept.
      ...(byHand !== null
        ? { unitPrice: byHand }
        : quoting
          ? { unitPrice: Number(line.price) }
          : {}),
    };
  }
  return {
    variantId: line.variantId,
    quantity: line.quantity,
    ...(byHand !== null ? { unitPrice: byHand } : {}),
    // CMB-03: a variant for each unit of each choice part, the one combo's choices for every combo of the line.
    ...(line.choices
      ? {
          choices: line.choices.map((choice) => ({
            part: choice.part,
            variantIds: Array.from({ length: line.quantity }, () => choice.variantIds).flat(),
          })),
        }
      : {}),
    ...(line.modifiers ? { modifiers: line.modifiers } : {}),
  };
}

/** How it reaches them: a delivery's thana, address and any charge by hand; a table's number; a takeaway nothing. */
function reachOf(draft: OrderDraft) {
  if (draft.type === FulfilmentType.DineIn) return { tableRef: textOf(draft.table) };
  if (draft.type === FulfilmentType.Takeaway) return {};
  const charge = draft.byHand ? amountOf(draft.charge) : null;
  return {
    locationId: draft.locationId ?? undefined,
    deliveryAddress: textOf(draft.address),
    ...(charge !== null ? { deliveryCharge: charge } : {}),
  };
}

/** D4-9: what the totals are priced from -- the items and how it reaches them, never who it is for. */
export function quoteOf(draft: OrderDraft): OrderBody | null {
  if (draft.lines.length === 0) return null;
  const discount = amountOf(draft.discount);
  return {
    fulfilmentType: draft.type,
    ...reachOf(draft),
    ...(discount !== null ? { discount } : {}),
    items: draft.lines.map((line) => itemOf(line, true)),
  };
}

/** ORD-22: the money received as it was entered; a wallet's number and TrxID, a bank's reference, cash neither. */
function paymentOf(draft: OrderDraft): OrderBody['payment'] {
  if (!draft.paid) return undefined;
  const cash = draft.method === PaymentMethod.Cash;
  const wallet = !cash && draft.method !== PaymentMethod.Bank;
  return {
    method: draft.method as NonNullable<OrderBody['payment']>['method'],
    amount: amountOf(draft.amount) ?? Number.NaN,
    ...(wallet && draft.sender.trim() !== ''
      ? { senderNumber: bangladeshiPhone.fromLocalPart(draft.sender) }
      : {}),
    ...(cash ? {} : { transactionId: textOf(draft.trxId) }),
  };
}

/** POST /orders: the order as typed; the server checks each field and names what is wrong. */
export function createOf(draft: OrderDraft, counter: boolean): OrderBody {
  const phone = draft.phone.trim();
  const discount = amountOf(draft.discount);
  return {
    customerName: textOf(draft.name),
    phone: phone === '' ? undefined : bangladeshiPhone.fromLocalPart(phone),
    fulfilmentType: draft.type,
    ...reachOf(draft),
    ...(discount !== null && discount > 0 ? { discount } : {}),
    notes: textOf(draft.note),
    ...(draft.confirmed && !counter ? { status: OrderStatus.Confirmed } : {}),
    payment: paymentOf(draft),
    items: draft.lines.map((line) => itemOf(line, false)),
  };
}

/** How a saved line reads on the form: its variant, a combo's choices, its add-ons. */
export type LineWords = (
  item: OrderItem,
) => Pick<DraftLine, 'label' | 'choiceText' | 'modifierText'>;

const UNSAID: LineWords = () => ({ label: '', choiceText: null, modifierText: null });

/** Edit order's form as the order now is (ORD-11): its details, and each line kept at the price it was ordered at. */
export function draftOf(order: Order, words: LineWords = UNSAID): OrderDraft {
  const byHand = order.deliveryChargeByHand;
  return {
    ...EMPTY_DRAFT,
    phone: order.customerPhone ? bangladeshiPhone.localPart(order.customerPhone) : '',
    name: order.customerName ?? '',
    type: order.fulfilmentType,
    locationId: order.location?.id ?? null,
    address: order.deliveryAddress ?? '',
    table: order.tableRef ?? '',
    discount: String(Number(order.discount)),
    byHand,
    charge: byHand ? String(Number(order.deliveryCharge)) : '',
    note: order.notes ?? '',
    lines: order.items.map((item) => ({
      key: item.id,
      lineId: item.id,
      variantId: item.variantId ?? '',
      productName: item.productName,
      ...words(item),
      combo: item.components.length > 0,
      base: item.listPrice,
      price: item.unitPrice,
      byHand: null,
      quantity: Number(item.quantity),
      available: null,
      choices: null,
      modifiers: null,
    })),
  };
}

/** PATCH /orders/:id: only what changed from the order as it was; the items whole when any line changed. */
export function editOf(order: Order, draft: OrderDraft): UpdateOrderInput | null {
  const was = draftOf(order);
  const body: Record<string, unknown> = {};
  const created = createOf(draft, false);
  const before = createOf(was, false);
  const nullable = ['customerName', 'phone', 'locationId', 'deliveryAddress', 'tableRef', 'notes'];
  for (const key of nullable) {
    const now = (created as Record<string, unknown>)[key] ?? null;
    if (now !== ((before as Record<string, unknown>)[key] ?? null)) body[key] = now;
  }
  if (draft.type !== was.type) body['fulfilmentType'] = draft.type;
  const charge = (created as { deliveryCharge?: number }).deliveryCharge ?? null;
  const chargeWas = (before as { deliveryCharge?: number }).deliveryCharge ?? null;
  if (charge !== chargeWas) body['deliveryCharge'] = charge;
  if ((created.discount ?? 0) !== (before.discount ?? 0)) body['discount'] = created.discount ?? 0;
  const items = draft.lines.map((line) => itemOf(line, false));
  if (JSON.stringify(items) !== JSON.stringify(was.lines.map((line) => itemOf(line, false)))) {
    body['items'] = items;
  }
  return Object.keys(body).length === 0 ? null : body;
}
