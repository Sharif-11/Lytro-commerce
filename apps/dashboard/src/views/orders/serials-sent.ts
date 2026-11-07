import type { SentSerials } from '@/api/orders';
import type { Order, OrderSerialItem } from '@/types/orders';

// INV-14: the serials a shipment, a hand-over or a courier booking sends, picked one for each serial-numbered unit.

/** A serial-numbered part's key: its line, and a combo's component by its variant. */
export const keyOf = (item: Pick<OrderSerialItem, 'lineId' | 'variantId'>) =>
  `${item.lineId} ${item.variantId}`;

/** The serials picked, as ship and hand-over send them: a combo's by its component's variant, any other by its line. */
export function sentOf(
  order: Order,
  items: OrderSerialItem[],
  picked: Map<string, string[]>,
): SentSerials[] {
  return items.map((item) => {
    const combo = order.items.some((line) => line.id === item.lineId && line.components.length > 0);
    return {
      lineId: item.lineId,
      ...(combo ? { variantId: item.variantId } : {}),
      serials: picked.get(keyOf(item)) ?? [],
    };
  });
}

/** Every serial-numbered unit has its serial (INV-14). */
export const allPicked = (items: OrderSerialItem[], picked: Map<string, string[]>) =>
  items.every((item) => (picked.get(keyOf(item)) ?? []).length === Number(item.quantity));
