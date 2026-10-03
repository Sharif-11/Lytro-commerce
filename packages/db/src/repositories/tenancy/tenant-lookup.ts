import { and, eq } from 'drizzle-orm';
import type { Database } from '../../client';
import { tenantDomains, tenants } from '../../schema';

// TEN-24/25/27: the only data the host resolver reads. Control schema, so no tenant context is needed.
// Returns the columns the resolver needs and nothing else (no owner, plan or balance).
export interface TenantLookupRow {
  id: string;
  slug: string;
  state: (typeof tenants.$inferSelect)['state'];
}

/** Finds a shop by its address label, e.g. `fashion-house` for fashion-house.<platform domain>. */
export async function findTenantBySlug(
  db: Database,
  slug: string,
): Promise<TenantLookupRow | null> {
  const rows = await db
    .select({ id: tenants.id, slug: tenants.slug, state: tenants.state })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

/** Finds the shop that owns a verified, active custom domain. Pending, failed and removed domains never match (TEN-12). */
export async function findTenantByActiveDomain(
  db: Database,
  hostname: string,
): Promise<TenantLookupRow | null> {
  const rows = await db
    .select({ id: tenants.id, slug: tenants.slug, state: tenants.state })
    .from(tenantDomains)
    .innerJoin(tenants, eq(tenants.id, tenantDomains.tenantId))
    .where(and(eq(tenantDomains.hostname, hostname), eq(tenantDomains.status, 'active')))
    .limit(1);
  return rows[0] ?? null;
}
