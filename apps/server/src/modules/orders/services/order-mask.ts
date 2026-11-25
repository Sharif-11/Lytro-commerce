import { maskedName, maskedPhone, OrderAccess } from '@lytronix/validators';
import type { OrderArea, OrderListItem, OrderView } from '../types/orders';

/**
 * PYG-22, PYG-23 (PAYG-FAIR-USE-PLAN PF-7, PF-21, PF-22, PF-30): what a pay-as-you-go order from Lytro shows before the
 * shop has opened it -- the one rule every read of an order applies, so no screen, print or export shows more.
 *
 * - **Locked (step 0):** the name's first letter and the phone's first and last three digits; no address, thana or
 *   shopper's note (it often carries a number); a payment's sender number masked like the phone.
 * - **Phone (step 1):** the name, phone, note and thana; the street address held back until it is confirmed.
 * - **Open or confirmed:** everything.
 */
export class OrderMask {
  constructor(private readonly access: OrderAccess) {}

  /** The order detail as this order's access lets the shop see it. */
  view(view: OrderView): OrderView {
    if (!this.hidesAddress()) return view;
    const locked = this.access === OrderAccess.Locked;
    return {
      ...view,
      customerName: locked ? maskedName(view.customerName) : view.customerName,
      customerPhone: locked ? this.phone(view.customerPhone) : view.customerPhone,
      deliveryAddress: null,
      // The thana shows from step 1, with the phone (the sketch's `pf-step1`); only the street waits for the confirm.
      location: locked ? null : view.location,
      shopperNote: locked ? null : view.shopperNote,
      payments: locked
        ? view.payments.map((payment) => ({
            ...payment,
            senderNumber: this.phone(payment.senderNumber),
          }))
        : view.payments,
    };
  }

  /** An order list row: a locked one names the zilla alone, never the thana. */
  row(row: OrderListItem): OrderListItem {
    if (this.access !== OrderAccess.Locked) return row;
    return {
      ...row,
      customerName: maskedName(row.customerName),
      customerPhone: this.phone(row.customerPhone),
      area: row.area === null ? null : this.zillaOnly(row.area),
      deliveryAddress: null,
    };
  }

  /** A whole order as an export writes it (PF-29): masked as the detail masks it. */
  record<
    T extends {
      customerName: string | null;
      customerPhone: string | null;
      deliveryAddress: string | null;
      shopperNote: string | null;
    },
  >(order: T): T {
    if (!this.hidesAddress()) return order;
    const locked = this.access === OrderAccess.Locked;
    return {
      ...order,
      customerName: locked ? maskedName(order.customerName) : order.customerName,
      customerPhone: locked ? this.phone(order.customerPhone) : order.customerPhone,
      deliveryAddress: null,
      shopperNote: locked ? null : order.shopperNote,
    };
  }

  private hidesAddress(): boolean {
    return this.access === OrderAccess.Locked || this.access === OrderAccess.Phone;
  }

  private phone(phone: string | null): string | null {
    return phone === null ? null : maskedPhone(phone);
  }

  private zillaOnly(area: OrderArea): OrderArea {
    return { ...area, thana: null };
  }
}
