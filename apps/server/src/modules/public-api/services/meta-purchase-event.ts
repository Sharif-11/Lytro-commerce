import { purchaseEventIdOf } from '../../orders/services/order-tracking';
import type { OrderLineRecord, OrderRecord } from '../../orders/types/orders';
import type { MetaServerEvent } from '../../shared/meta-conversions/ports/meta-conversions';
import { metaHash, metaPhoneOf } from '../../shared/meta-conversions/services/meta-user-data';

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
      ph: order.customerPhone !== null ? [metaHash(metaPhoneOf(order.customerPhone))] : [],
      ...(district !== null && metaCityOf(district) !== ''
        ? { ct: [metaHash(metaCityOf(district))] }
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
