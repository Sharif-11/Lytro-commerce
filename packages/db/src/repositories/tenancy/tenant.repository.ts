import { and, eq } from 'drizzle-orm';
import type { Database } from '../../client';
import type { Executor } from '../../transactions';
import { plans, tenantDomains, tenants } from '../../schema';
import { DomainStatus, type PlanLimits } from '@lytronix/validators';

// Shop rows and their lookups. The trial period and plan choice are decided by the tenancy service.
export interface TenantLookupRow {
  id: string;
  slug: string;
  state: (typeof tenants.$inferSelect)['state'];
}

export class TenantRepository {
  /** Finds a shop by its address label, e.g. `fashion-house` for fashion-house.<platform domain>. */
  async findBySlug(db: Database, slug: string): Promise<TenantLookupRow | null> {
    const rows = await db
      .select({ id: tenants.id, slug: tenants.slug, state: tenants.state })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);
    return rows[0] ?? null;
  }

  /** The shop that owns a verified, active custom domain. Pending, failed and removed domains never match (TEN-12). */
  async findByActiveDomain(db: Database, hostname: string): Promise<TenantLookupRow | null> {
    const rows = await db
      .select({ id: tenants.id, slug: tenants.slug, state: tenants.state })
      .from(tenantDomains)
      .innerJoin(tenants, eq(tenants.id, tenantDomains.tenantId))
      .where(
        and(eq(tenantDomains.hostname, hostname), eq(tenantDomains.status, DomainStatus.Active)),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async insert(
    db: Executor,
    values: {
      ownerIdentityId: string;
      subscriberId: string;
      shopName: string;
      slug: string;
      planId: string;
      planSnapshot: PlanLimits;
      periodStart: Date;
      periodEnd: Date;
    },
  ): Promise<string> {
    const [row] = await db.insert(tenants).values(values).returning({ id: tenants.id });
    if (!row) throw new Error('insert returned no tenant');
    return row.id;
  }

  /** A plan offered for sale or not, by name. Used to find the Trial plan (D3). */
  async findPlanByName(
    db: Executor,
    name: string,
    forSale: boolean,
  ): Promise<{ id: string; limits: PlanLimits } | null> {
    const rows = await db
      .select({ id: plans.id, limits: plans.limits })
      .from(plans)
      .where(and(eq(plans.name, name), eq(plans.forSale, forSale)))
      .limit(1);
    return rows[0] ?? null;
  }
}
