import { Inject, Injectable } from '@nestjs/common';
import { EssentialSmsUsageRepository, type Transaction } from '@lytronix/db';
import type { SmsKind } from '@lytronix/validators';
import type { EssentialSmsUsageStore } from '../../modules/sms-usage/ports/essential-sms-usage-store';
import { DatabaseService } from '../database.service';

/** control.essential_sms_usage (AUTH-21). */
@Injectable()
export class DrizzleEssentialSmsUsageStore implements EssentialSmsUsageStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(EssentialSmsUsageRepository) private readonly usage: EssentialSmsUsageRepository,
  ) {}

  record(
    tx: Transaction,
    values: { tenantId: string; kind: SmsKind; parts: number },
  ): Promise<void> {
    return this.usage.insert(tx, values);
  }

  sumPartsSince(tenantId: string, since: Date | null): Promise<number> {
    return this.usage.sumPartsSince(this.database.handle.db, tenantId, since);
  }
}
