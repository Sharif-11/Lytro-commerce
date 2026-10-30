import { Inject, Injectable } from '@nestjs/common';
import {
  AddonPurchaseRepository,
  TenantDomainRepository,
  TenantRepository,
  TransactionRunner,
  type Transaction,
} from '@lytronix/db';
import { UniqueViolation } from '../../common/errors/unique-violation';
import type { DomainStore } from '../../modules/domains/ports/domain-store';
import type { DomainRow, DomainToCheck, FeatureHoldings } from '../../modules/domains/types/domain';
import { DatabaseService } from '../database.service';

/** control.tenant_domains, and the shop's plan features and add-ons (TEN-09 to TEN-14, DWN-10). */
@Injectable()
export class DrizzleDomainStore implements DomainStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(TenantDomainRepository) private readonly domains: TenantDomainRepository,
    @Inject(TenantRepository) private readonly tenants: TenantRepository,
    @Inject(AddonPurchaseRepository) private readonly addonPurchases: AddonPurchaseRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  current(tx: Transaction, tenantId: string): Promise<DomainRow | null> {
    return this.domains.current(tx, tenantId);
  }

  activeOwner(tx: Transaction, hostname: string): Promise<string | null> {
    return this.domains.activeOwner(tx, hostname);
  }

  async insert(
    tx: Transaction,
    values: { tenantId: string; hostname: string; twin: string },
  ): Promise<DomainRow> {
    try {
      return await this.domains.insert(tx, values);
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, 'tenant_domains_one_per_shop')) {
        throw new UniqueViolation('domain');
      }
      throw error;
    }
  }

  update(tx: Transaction, id: string, patch: Partial<DomainRow>): Promise<DomainRow> {
    return this.domains.update(tx, id, patch);
  }

  listToCheck(): Promise<DomainToCheck[]> {
    return this.domains.listToCheck(this.database.handle.db);
  }

  async holdings(tx: Transaction, tenantId: string): Promise<FeatureHoldings> {
    const info = await this.tenants.findBillingInfo(tx, tenantId);
    const active = await this.addonPurchases.listActive(tx, tenantId);
    return { features: info?.featureSnapshot ?? null, active };
  }

  removeAllForTenant(tenantId: string, at: Date): Promise<void> {
    return this.domains.removeAllForTenant(this.database.handle.db, tenantId, at);
  }
}
