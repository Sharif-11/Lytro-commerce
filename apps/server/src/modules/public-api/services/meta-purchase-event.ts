import { createHash } from 'node:crypto';
import { purchaseEventIdOf } from '../../orders/services/order-tracking';
import type { OrderLineRecord, OrderRecord } from '../../orders/types/orders';
import type { MetaServerEvent } from '../ports/meta-conversions';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Meta's phone form: the country code and number, digits only -- 8801712345678 for 01712345678. */
export function metaPhoneOf(localPhone: string): string {
  return `88${localPhone.replace(/\D/g, '')}`;
}

/** Meta's city form: lowercase letters only -- "coxsbazar" for "Cox's Bazar". */
export function metaCityOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * LND-16, LND-15, FED-02: a shopper's order as Meta's `Purchase` event: the same event ID the browser sends, so Meta
 * counts it once; the customer told of only by the hashed phone number and district; and the variant IDs the catalog
 * feed lists, so an ad's items are credited.
 */
export function purchaseEventOf(
  order: OrderRecord,
  lines: OrderLineRecord[],
  district: string | null,
): MetaServerEvent {
  const items = lines.filter((line) => line.variantId !== null);
  return {
    event_name: 'Purchase',
    event_time: Math.floor(order.createdAt.getTime() / 1000),
    event_id: purchaseEventIdOf(order.trackingId),
    action_source: 'website',
    user_data: {
      ph: order.customerPhone !== null ? [sha256(metaPhoneOf(order.customerPhone))] : [],
      ...(district !== null && metaCityOf(district) !== ''
        ? { ct: [sha256(metaCityOf(district))] }
        : {}),
    },
    custom_data: {
      currency: 'BDT',
      value: Number(order.grandTotal),
      content_type: 'product',
      content_ids: items.map((line) => line.variantId ?? ''),
      contents: items.map((line) => ({
        id: line.variantId ?? '',
        quantity: Number(line.quantity),
      })),
      order_id: order.orderNumber,
    },
  };
}
