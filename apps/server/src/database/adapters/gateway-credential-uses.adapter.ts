import { Inject, Injectable } from '@nestjs/common';
import {
  GatewayCredentialUseRepository,
  TransactionRunner,
  type SelectGatewayCredentialUse,
  type Transaction,
} from '@lytronix/db';
import type { CredentialUseStore } from '../../modules/gateway/ports/credential-use-store';
import type { CredentialUse } from '../../modules/gateway/ports/wallet-gateway';
import { DatabaseService } from '../database.service';

@Injectable()
export class DrizzleCredentialUseStore implements CredentialUseStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(GatewayCredentialUseRepository) private readonly uses: GatewayCredentialUseRepository,
  ) {}

  private run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  record(use: CredentialUse): Promise<void> {
    const { tenantId, ...values } = use;
    return this.run((tx) => this.uses.insert(tx, tenantId, values));
  }

  tokenCallsSince(tenantId: string, accountId: string, since: Date): Promise<number> {
    return this.run((tx) => this.uses.tokenCallsSince(tx, tenantId, accountId, since));
  }

  list(
    tenantId: string,
    page: { offset: number; limit: number },
  ): Promise<{ rows: SelectGatewayCredentialUse[]; total: number }> {
    return this.run((tx) => this.uses.list(tx, tenantId, page));
  }
}
