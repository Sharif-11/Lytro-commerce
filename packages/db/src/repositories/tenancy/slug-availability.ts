import { inArray } from 'drizzle-orm';
import type { Database } from '../../client';
import { reservedSlugs, tenants } from '../../schema';

// AUTH-11, TEN-26: a slug is unavailable when a shop holds it or it is reserved. One round trip for a whole
// batch of candidates, so suffix suggestions do not cost one query each.
export async function findUnavailableSlugs(db: Database, slugs: string[]): Promise<Set<string>> {
  if (slugs.length === 0) return new Set();

  const [taken, reserved] = await Promise.all([
    db.select({ slug: tenants.slug }).from(tenants).where(inArray(tenants.slug, slugs)),
    db
      .select({ slug: reservedSlugs.slug })
      .from(reservedSlugs)
      .where(inArray(reservedSlugs.slug, slugs)),
  ]);

  return new Set([...taken, ...reserved].map((row) => row.slug));
}
