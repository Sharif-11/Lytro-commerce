import { Inject, Injectable } from '@nestjs/common';
import type { PaymentSessionStore } from '../ports/payment-session-store';
import { PAYMENT_SESSION_STORE } from '../tokens';

/** LIF-19: the day-60 deletion job's payment-sessions step -- the sessions and their references. Safe to run again. */
@Injectable()
export class PaymentSessionsEraser {
  constructor(@Inject(PAYMENT_SESSION_STORE) private readonly store: PaymentSessionStore) {}

  deleteAllForTenant(tenantId: string): Promise<void> {
    return this.store.run((tx) => this.store.deleteAllForTenant(tx, tenantId));
  }
}
