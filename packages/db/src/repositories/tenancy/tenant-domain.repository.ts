import { and, asc, eq, ne, or } from 'drizzle-orm';
import { DomainStatus } from '@lytronix/validators';
import type { Executor } from '../../transactions';
import { tenantDomains, tenants } from '../../schema';
import type { SelectTenantDomain, UpdateTenantDomain } from '../../schema/control/tenancy';

// TEN-09 to TEN-14, DWN-10 (Slice 13): a shop's own domain, as its page and the recurring check read and write it. The
// host-to-shop lookup itself stays in TenantRepository.findByActiveDomain (TEN-24).

/** A domain the recurring check looks at, with the shop address its records must name. */
export type DomainToCheckRow = SelectTenantDomain & { slug: string };

export class TenantDomainRepository {
  /** The shop's domain, whatever its state but removed; a shop has one at most. */
  async current(db: Executor, tenantId: string): Promise<SelectTenantDomain | null> {
    const rows = await db
      .select()
      .from(tenantDomains)
      .where(
        and(eq(tenantDomains.tenantId, tenantId), ne(tenantDomains.status, DomainStatus.Removed)),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  /** TEN-12: the shop an active domain belongs to under this name, its twin included -- served or kept off (DWN-10). */
  async activeOwner(db: Executor, hostname: string): Promise<string | null> {
    const rows = await db
      .select({ tenantId: tenantDomains.tenantId })
      .from(tenantDomains)
      .where(
        and(
          eq(tenantDomains.status, DomainStatus.Active),
          or(
            eq(tenantDomains.hostname, hostname),
            and(eq(tenantDomains.twin, hostname), eq(tenantDomains.twinActive, true)),
          ),
        ),
      )
      .limit(1);
    return rows[0]?.tenantId ?? null;
  }

  async insert(
    db: Executor,
    values: { tenantId: string; hostname: string; twin: string },
  ): Promise<SelectTenantDomain> {
    const rows = await db.insert(tenantDomains).values(values).returning();
    const row = rows[0];
    if (!row) throw new Error('the domain was not added');
    return row;
  }

  async update(db: Executor, id: string, patch: UpdateTenantDomain): Promise<SelectTenantDomain> {
    const rows = await db
      .update(tenantDomains)
      .set(patch)
      .where(eq(tenantDomains.id, id))
      .returning();
    const row = rows[0];
    if (!row) throw new Error('the domain is gone');
    return row;
  }

  /** Every domain the recurring check looks at -- waiting or active, not those that could not be verified -- oldest
      first, each with its shop's address. */
  async listToCheck(db: Executor): Promise<DomainToCheckRow[]> {
    const rows = await db
      .select({ domain: tenantDomains, slug: tenants.slug })
      .from(tenantDomains)
      .innerJoin(tenants, eq(tenants.id, tenantDomains.tenantId))
      .where(
        or(
          eq(tenantDomains.status, DomainStatus.Pending),
          eq(tenantDomains.status, DomainStatus.Active),
        ),
      )
      .orderBy(asc(tenantDomains.createdAt));
    return rows.map((row) => ({ ...row.domain, slug: row.slug }));
  }

  /** LIF-19: a deleted shop's domain stops answering for it and is free to add elsewhere. Safe to run again. */
  async removeAllForTenant(db: Executor, tenantId: string, at: Date): Promise<void> {
    await db
      .update(tenantDomains)
      .set({ status: DomainStatus.Removed, removedAt: at, twinActive: false })
      .where(
        and(eq(tenantDomains.tenantId, tenantId), ne(tenantDomains.status, DomainStatus.Removed)),
      );
  }
}
