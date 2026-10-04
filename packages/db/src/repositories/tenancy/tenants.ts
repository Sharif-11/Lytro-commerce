import { and, eq } from 'drizzle-orm';
import type { Executor } from '../../transactions';
import { plans, tenants } from '../../schema';

// TEN-15, AUTH-10: rows for shops. The trial period and plan choice are decided by the tenancy service.

export async function insertTenant(
  db: Executor,
  values: {
    ownerIdentityId: string;
    subscriberId: string;
    shopName: string;
    slug: string;
    planId: string;
    planSnapshot: unknown;
    periodStart: Date;
    periodEnd: Date;
  },
): Promise<string> {
  const [row] = await db.insert(tenants).values(values).returning({ id: tenants.id });
  if (!row) throw new Error('insert returned no tenant');
  return row.id;
}

/** A plan offered for sale or not, by name. Used to find the Trial plan (D3). */
export async function findPlanByName(
  db: Executor,
  name: string,
  forSale: boolean,
): Promise<{ id: string; limits: unknown } | null> {
  const rows = await db
    .select({ id: plans.id, limits: plans.limits })
    .from(plans)
    .where(and(eq(plans.name, name), eq(plans.forSale, forSale)))
    .limit(1);
  return rows[0] ?? null;
}
