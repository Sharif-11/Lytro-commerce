import { Inject, Injectable } from '@nestjs/common';
import type { CredentialUseStore } from '../ports/credential-use-store';
import { CREDENTIAL_USE_LOG } from '../tokens';
import type { CredentialUsePage } from '../types/gateway';

/** SEC-11 (Phase 5 Slice 5.7): a shop's log of its stored credentials' uses, for the operator. */
@Injectable()
export class CredentialUses {
  constructor(@Inject(CREDENTIAL_USE_LOG) private readonly store: CredentialUseStore) {}

  async list(tenantId: string, page: number, limit: number): Promise<CredentialUsePage> {
    const found = await this.store.list(tenantId, { offset: (page - 1) * limit, limit });
    return {
      uses: found.rows.map((row) => ({
        method: row.method,
        action: row.action,
        accountId: row.accountId,
        sessionId: row.sessionId,
        succeeded: row.succeeded,
        at: row.at,
      })),
      page,
      limit,
      total: found.total,
      pages: Math.ceil(found.total / limit),
    };
  }
}
