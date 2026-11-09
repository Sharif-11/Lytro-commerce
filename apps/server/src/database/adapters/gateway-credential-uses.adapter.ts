import { Inject, Injectable } from '@nestjs/common';
import {
  GatewayCredentialUseRepository,
  LytroPaymentMethodsRepository,
  TransactionRunner,
  type SelectGatewayCredentialUse,
  type Transaction,
} from '@lytronix/db';
import type { CredentialUseStore } from '../../modules/gateway/ports/credential-use-store';
import {
  LYTRO_GATEWAY_OWNER,
  type CredentialUse,
} from '../../modules/gateway/ports/wallet-gateway';
import { PaymentMethod } from '@lytronix/validators';
import { DatabaseService } from '../database.service';

@Injectable()
export class DrizzleCredentialUseStore implements CredentialUseStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(GatewayCredentialUseRepository) private readonly uses: GatewayCredentialUseRepository,
    @Inject(LytroPaymentMethodsRepository) private readonly lytro: LytroPaymentMethodsRepository,
  ) {}

  private run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  record(use: CredentialUse): Promise<void> {
    const { tenantId, ...values } = use;
    if (tenantId === LYTRO_GATEWAY_OWNER) {
      return this.lytro.recordGatewayUse(this.database.handle.db, {
        method: use.method,
        action: use.action,
        paymentId: use.sessionId,
        succeeded: use.succeeded,
        at: use.at,
      });
    }
    return this.run((tx) => this.uses.insert(tx, tenantId, values));
  }

  tokenCallsSince(tenantId: string, accountId: string, since: Date): Promise<number> {
    if (tenantId === LYTRO_GATEWAY_OWNER) {
      return this.lytro.tokenCallsSince(this.database.handle.db, PaymentMethod.Bkash, since);
    }
    return this.run((tx) => this.uses.tokenCallsSince(tx, tenantId, accountId, since));
  }

  list(
    tenantId: string,
    page: { offset: number; limit: number },
  ): Promise<{ rows: SelectGatewayCredentialUse[]; total: number }> {
    return this.run((tx) => this.uses.list(tx, tenantId, page));
  }
}
