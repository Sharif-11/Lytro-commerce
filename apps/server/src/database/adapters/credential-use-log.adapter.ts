import { Inject, Injectable } from '@nestjs/common';
import {
  CredentialUseExportRepository,
  TransactionRunner,
  type CredentialUseRow,
} from '@lytronix/db';
import type { CredentialUseLog } from '../../modules/team/services/credential-use-export';
import { DatabaseService } from '../database.service';

/** SEC-11 (Slice 9.7): a shop's three credential-use logs, read in one transaction in its own context. */
@Injectable()
export class DrizzleCredentialUseLog implements CredentialUseLog {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(CredentialUseExportRepository) private readonly uses: CredentialUseExportRepository,
  ) {}

  between(tenantId: string, from: Date, to: Date): Promise<CredentialUseRow[]> {
    return this.transactions.run(this.database.handle.db, (tx) =>
      this.uses.between(tx, tenantId, from, to),
    );
  }
}
