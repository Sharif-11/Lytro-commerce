import { Inject, Injectable } from '@nestjs/common';
import { CustomerService } from '../../customers/services/customer.service';
import type { OrderStore } from '../ports/order-store';
import { ORDER_STORE } from '../tokens';

/**
 * LIF-19: the day-60 deletion job's orders step: the shop's orders with their items, history and calls, its daily
 * counters, and then its customers. The database lets this through only for a shop that is archived or deleted. Runs
 * after the inventory step, since the stock held for an order and the serials sold to one name it, and before the
 * catalogue's; safe to run again.
 */
@Injectable()
export class OrdersEraser {
  constructor(
    @Inject(ORDER_STORE) private readonly store: OrderStore,
    @Inject(CustomerService) private readonly customers: CustomerService,
  ) {}

  async deleteAllForTenant(tenantId: string): Promise<void> {
    await this.store.run(tenantId, (tx) => this.store.deleteAllForTenant(tx, tenantId));
    await this.customers.deleteAllForTenant(tenantId);
  }
}
