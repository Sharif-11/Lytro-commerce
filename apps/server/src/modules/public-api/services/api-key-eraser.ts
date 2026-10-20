import { Inject, Injectable } from '@nestjs/common';
import type { ApiKeyStore } from '../ports/api-key-store';
import { API_KEY_STORE } from '../tokens';

/** LIF-19: the day-60 deletion job's API step: the shop's keys (credentials, not history) and its request counts. */
@Injectable()
export class ApiKeyEraser {
  constructor(@Inject(API_KEY_STORE) private readonly store: ApiKeyStore) {}

  deleteAllForTenant(tenantId: string): Promise<void> {
    return this.store.deleteAllForTenant(tenantId);
  }
}
