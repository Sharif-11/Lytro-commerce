import { IdentityKind, type TenantState } from '@lytronix/validators';
import { and, eq } from 'drizzle-orm';
import type { Executor } from '../../transactions';
import { subscriberIdentities, subscribers, tenants } from '../../schema';

// AUTH-08: a value belongs to at most one subscriber per kind. The unique index on (kind, value) enforces it; a
// violation surfaces as a unique-violation error, which the server maps to a clear answer.
export class AccountRepository {
  async findSubscriberByIdentity(
    db: Executor,
    kind: IdentityKind,
    value: string,
  ): Promise<{ subscriberId: string; passwordHash: string | null } | null> {
    const rows = await db
      .select({
        subscriberId: subscribers.id,
        passwordHash: subscribers.passwordHash,
      })
      .from(subscriberIdentities)
      .innerJoin(subscribers, eq(subscribers.id, subscriberIdentities.subscriberId))
      .where(and(eq(subscriberIdentities.kind, kind), eq(subscriberIdentities.value, value)))
      .limit(1);
    return rows[0] ?? null;
  }

  async findSubscriberById(
    db: Executor,
    subscriberId: string,
  ): Promise<{ passwordHash: string | null } | null> {
    const rows = await db
      .select({ passwordHash: subscribers.passwordHash })
      .from(subscribers)
      .where(eq(subscribers.id, subscriberId))
      .limit(1);
    return rows[0] ?? null;
  }

  async markSignedIn(db: Executor, subscriberId: string, at: Date): Promise<void> {
    await db.update(subscribers).set({ lastSignInAt: at }).where(eq(subscribers.id, subscriberId));
  }

  async setPasswordHash(db: Executor, subscriberId: string, passwordHash: string): Promise<void> {
    await db.update(subscribers).set({ passwordHash }).where(eq(subscribers.id, subscriberId));
  }

  async insertSubscriber(db: Executor): Promise<string> {
    const [row] = await db.insert(subscribers).values({}).returning({ id: subscribers.id });
    if (!row) throw new Error('insert returned no subscriber');
    return row.id;
  }

  async insertIdentity(
    db: Executor,
    values: { subscriberId: string; kind: IdentityKind; value: string; verifiedAt: Date },
  ): Promise<string> {
    const [row] = await db
      .insert(subscriberIdentities)
      .values({
        subscriberId: values.subscriberId,
        kind: values.kind,
        value: values.value,
        verifiedAt: values.verifiedAt,
      })
      .returning({ id: subscriberIdentities.id });
    if (!row) throw new Error('insert returned no identity');
    return row.id;
  }

  async findIdentityOf(
    db: Executor,
    subscriberId: string,
    kind: IdentityKind,
  ): Promise<{ id: string; value: string } | null> {
    const rows = await db
      .select({ id: subscriberIdentities.id, value: subscriberIdentities.value })
      .from(subscriberIdentities)
      .where(
        and(
          eq(subscriberIdentities.subscriberId, subscriberId),
          eq(subscriberIdentities.kind, kind),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async findOwnedTenant(
    db: Executor,
    subscriberId: string,
  ): Promise<{ id: string; state: TenantState; suspendedAt: Date | null } | null> {
    const rows = await db
      .select({ id: tenants.id, state: tenants.state, suspendedAt: tenants.suspendedAt })
      .from(tenants)
      .where(eq(tenants.subscriberId, subscriberId))
      .limit(1);
    return rows[0] ?? null;
  }
}
