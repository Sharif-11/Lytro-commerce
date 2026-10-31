import { Inject, Injectable } from '@nestjs/common';
import type { PaymentMethodStore } from '../ports/payment-method-store';
import { PAYMENT_METHOD_STORE } from '../tokens';

/** LIF-19: the day-60 deletion job's payment-methods step -- the shop's accounts and switches. Safe to run again. */
@Injectable()
export class PaymentMethodsEraser {
  constructor(@Inject(PAYMENT_METHOD_STORE) private readonly store: PaymentMethodStore) {}

  deleteAllForTenant(tenantId: string): Promise<void> {
    return this.store.run(tenantId, (tx) => this.store.deleteAllForTenant(tx, tenantId));
  }
}
