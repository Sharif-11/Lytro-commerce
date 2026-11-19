import { LIVE_PARCEL_STATES } from '@lytronix/validators';
import { courierName } from '@/lib/couriers';
import type { Order } from '@/types/orders';
import type { OrderParcel } from '@/types/couriers';

// What a courier label prints beside its pictures (TENANT-DASHBOARD-DESIGN §7.47, laid out as Steadfast's own label).

type LabelOrder = Pick<Order, 'orderNumber' | 'courierName' | 'trackingCode' | 'parcel' | 'items'>;

/** The booking the label stands for: a parcel still live with its courier, holding the courier's consignment ID. */
function bookedParcel(order: LabelOrder): OrderParcel | null {
  const parcel = order.parcel;
  return parcel && LIVE_PARCEL_STATES.includes(parcel.state) && parcel.consignmentId
    ? parcel
    : null;
}

/** What the barcode and the QR hold: the courier's consignment ID once booked through Lytro, else the order number. */
export function labelCode(order: LabelOrder): string {
  return bookedParcel(order)?.consignmentId ?? order.orderNumber;
}

/** The ID row: the consignment ID, or the tracking code typed for a parcel sent by hand; null with neither. */
export function labelId(order: LabelOrder): string | null {
  return bookedParcel(order)?.consignmentId ?? order.trackingCode ?? null;
}

/** The Courier row: the order's courier, or its booked parcel's; null before either. */
export function labelCourier(order: LabelOrder): string | null {
  const parcel = bookedParcel(order);
  return order.courierName ?? (parcel ? courierName(parcel.courierKey) : null);
}

/** The Weight row in kg: the weight sent with the booking, else the items' weights; null with none. */
export function labelWeightKg(order: LabelOrder): number | null {
  const sent = Number(bookedParcel(order)?.weightKg ?? 0);
  if (sent > 0) return Number(sent.toFixed(3));
  const summed = order.items.reduce(
    (sum, item) => sum + Number(item.weightKg ?? 0) * Number(item.quantity),
    0,
  );
  return summed > 0 ? Number(summed.toFixed(3)) : null;
}
