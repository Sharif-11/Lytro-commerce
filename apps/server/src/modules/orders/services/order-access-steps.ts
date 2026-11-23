import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { AuditAction, OrderAccess, StatusOverride } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { PayAsYouGoBillingService } from '../../balance/services/payg-billing.service';
import { CatalogueActivity, type ResolvedActor } from '../../catalogue/services/catalogue-activity';
import { CustomerService } from '../../customers/services/customer.service';
import type { OrderStore } from '../ports/order-store';
import { ORDER_STORE } from '../tokens';
import type { OrderRecord } from '../types/orders';
import { HandlingQuota, type HandlingShop } from './handling-quota';

/**
 * PYG-22 to PYG-24, PYG-27 (PAYG-FAIR-USE-PLAN PF-1 to PF-6, PF-22 to PF-24, PF-27, PF-31, PF-33, PFQ-3): the steps that
 * open a pay-as-you-go order from Lytro, each in the caller's transaction with the order held, so a double tap or two
 * staff at once charge once.
 *
 * - **Step 1, the phone (৳7):** shows the name, phone and note, and makes the customer (CUS-01 amended).
 * - **Step 2, the confirm (৳3):** any confirmation of an order at step 1 -- the confirm, a call marked confirmed, a
 *   courier booked, a hand-over -- shows the address. A locked order can't skip step 1.
 * - **A plan bought:** every order not yet opened is opened free.
 * - **A verified advance:** opens both steps at once when the balance covers them; otherwise the order stays as it was.
 *
 * Every charge lands in the activity log with who opened it (PF-31). Nothing is ever refunded (PF-6).
 */
@Injectable()
export class OrderAccessSteps {
  constructor(
    @Inject(ORDER_STORE) private readonly store: OrderStore,
    @Inject(PayAsYouGoBillingService) private readonly payg: PayAsYouGoBillingService,
    @Inject(CustomerService) private readonly customers: CustomerService,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(HandlingQuota) private readonly quota: HandlingQuota,
  ) {}

  /**
   * PF-2: step 1. An order already past it is returned as it is, so a second tap charges nothing. Given the shop, the
   * order takes its place under the shop's handling limits here, once ever (PF-8): the day's cap counts it at step 1,
   * before the ৳7 is charged, and its later handling doesn't count it again.
   */
  async showPhoneWithin(
    tx: Transaction,
    tenantId: string,
    order: OrderRecord,
    who: ResolvedActor,
    now: Date,
    shop?: HandlingShop,
  ): Promise<OrderRecord> {
    if (order.access !== OrderAccess.Locked) return order;
    if (order.statusOverride === StatusOverride.Cancelled) {
      throw new ApiError('conflict', 'OrderIsCancelled', {});
    }
    const counts = shop !== undefined && order.handledAt === null;
    if (counts) await this.quota.admitWithin(tx, shop, now);
    const charged = await this.payg.chargeUnlock(tx, tenantId, order.id, 'phone');
    const reached = await this.reachedWithin(tx, tenantId, order, OrderAccess.Phone, who, now);
    const updated = counts
      ? await this.store.updateOrder(tx, tenantId, order.id, { handledAt: now })
      : reached;
    await this.record(tx, tenantId, who, updated, 'phone', charged?.amount ?? null);
    return updated;
  }

  /**
   * PF-3, PF-23: step 2, inside whatever confirms the order. An open or confirmed order passes unchanged; a locked one is
   * refused, since the first paid step is always the phone.
   */
  async confirmWithin(
    tx: Transaction,
    tenantId: string,
    order: OrderRecord,
    who: ResolvedActor,
  ): Promise<OrderRecord> {
    if (order.access === OrderAccess.Open || order.access === OrderAccess.Confirmed) return order;
    if (order.access === OrderAccess.Locked) throw new ApiError('conflict', 'OrderLocked', {});
    const charged = await this.payg.chargeUnlock(tx, tenantId, order.id, 'confirm');
    const updated = await this.store.updateOrder(tx, tenantId, order.id, {
      access: OrderAccess.Confirmed,
    });
    await this.record(tx, tenantId, who, updated, 'confirm', charged?.amount ?? null);
    return updated;
  }

  /** PYG-22: refuses what needs the customer before the shop has reached them -- a call, an edit, a booking. */
  refuseLocked(order: OrderRecord): void {
    if (order.access === OrderAccess.Locked) throw new ApiError('conflict', 'OrderLocked', {});
  }

  /**
   * PFQ-3: a verified advance on an order not yet opened opens it fully, both steps charged, when the balance covers
   * them; short of that, it stays as it was and the seller opens it as any other.
   */
  async openPaidWithin(
    tx: Transaction,
    tenantId: string,
    order: OrderRecord,
    who: ResolvedActor,
    now: Date,
  ): Promise<OrderRecord> {
    if (order.access !== OrderAccess.Locked && order.access !== OrderAccess.Phone) return order;
    const steps: ('phone' | 'confirm')[] =
      order.access === OrderAccess.Locked ? ['phone', 'confirm'] : ['confirm'];
    if (!(await this.payg.coversUnlock(tx, tenantId, steps))) return order;
    const shown = await this.showPhoneWithin(tx, tenantId, order, who, now);
    return this.confirmWithin(tx, tenantId, shown, who);
  }

  /**
   * PF-33: a pay-as-you-go shop that bought a plan has every order it hadn't opened opened free, from the moment the
   * plan starts; each gets its customer as a phone shown would. Charges already made stay.
   */
  async openAllWithin(tx: Transaction, tenantId: string): Promise<number> {
    const opened = await this.store.openAll(tx, tenantId);
    const customerIds: (string | null)[] = [];
    for (const order of opened) {
      if (order.customerId !== null || order.customerPhone === null) continue;
      const customerId = await this.customers.claimWithin(tx, tenantId, order.customerPhone);
      await this.store.updateOrder(tx, tenantId, order.id, { customerId });
      customerIds.push(customerId);
    }
    await this.customers.recountWithin(tx, tenantId, customerIds);
    return opened.length;
  }

  /** Step 1's reach: the order at its new access, its customer made from its phone (PF-27). */
  private async reachedWithin(
    tx: Transaction,
    tenantId: string,
    order: OrderRecord,
    access: OrderAccess,
    who: ResolvedActor,
    now: Date,
  ): Promise<OrderRecord> {
    const customerId =
      order.customerId ??
      (order.customerPhone !== null && order.customerErasedAt === null
        ? await this.customers.claimWithin(tx, tenantId, order.customerPhone)
        : null);
    const updated = await this.store.updateOrder(tx, tenantId, order.id, {
      access,
      phoneShownAt: now,
      phoneShownBy: who.id,
      customerId,
    });
    await this.customers.recountWithin(tx, tenantId, [customerId]);
    return updated;
  }

  private record(
    tx: Transaction,
    tenantId: string,
    who: ResolvedActor,
    order: OrderRecord,
    step: 'phone' | 'confirm',
    charged: string | null,
  ): Promise<void> {
    return this.activity.record(
      tx,
      tenantId,
      who,
      AuditAction.OrderUnlocked,
      { type: 'order', id: order.id },
      { orderNumber: order.orderNumber, step, charged },
    );
  }
}
