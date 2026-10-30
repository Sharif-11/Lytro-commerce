import { Inject, Injectable } from '@nestjs/common';
import type { DomainStore } from '../ports/domain-store';
import { DOMAIN_STORE } from '../tokens';

/** LIF-19: the day-60 deletion job's domain step -- the shop's domain removed, free to add elsewhere. Safe to run again. */
@Injectable()
export class DomainEraser {
  constructor(@Inject(DOMAIN_STORE) private readonly store: DomainStore) {}

  removeAllForTenant(tenantId: string, at: Date): Promise<void> {
    return this.store.removeAllForTenant(tenantId, at);
  }
}
