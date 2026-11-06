import { Inject, Injectable } from '@nestjs/common';
import { EssentialSmsUsageRepository, TenantRepository, type Transaction } from '@lytronix/db';
import type { SmsKind } from '@lytronix/validators';
import type {
  EssentialSmsUsageStore,
  UsageCycleTenant,
} from '../../modules/sms-usage/ports/essential-sms-usage-store';
import { DatabaseService } from '../database.service';

/** control.essential_sms_usage (AUTH-21). */
@Injectable()
export class DrizzleEssentialSmsUsageStore implements EssentialSmsUsageStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(EssentialSmsUsageRepository) private readonly usage: EssentialSmsUsageRepository,
    @Inject(TenantRepository) private readonly tenants: TenantRepository,
  ) {}

  record(
    tx: Transaction,
    values: { tenantId: string; kind: SmsKind; units: number },
  ): Promise<string> {
    return this.usage.insert(tx, values);
  }

  delete(tx: Transaction, id: string): Promise<void> {
    return this.usage.delete(tx, id);
  }

  sumUnitsSince(tenantId: string, since: Date | null): Promise<number> {
    return this.usage.sumUnitsSince(this.database.handle.db, tenantId, since);
  }

  async findCycleTenant(tenantId: string): Promise<UsageCycleTenant | null> {
    const info = await this.tenants.findBillingInfo(this.database.handle.db, tenantId);
    return info && { state: info.state, periodStart: info.periodStart, createdAt: info.createdAt };
  }
}
