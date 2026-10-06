import { IdentityKind, type TenantState } from '@lytronix/validators';
import { and, eq } from 'drizzle-orm';
import type { Executor } from '../../transactions';
import { subscriberIdentities, subscribers, tenants } from '../../schema';

// AUTH-08: a phone belongs to at most one subscriber. The unique index on (kind, value) enforces it; a violation
// surfaces as a unique-violation error, which the server maps to a clear answer.
export class AccountRepository {
  async findSubscriberByPhone(
    db: Executor,
    phone: string,
  ): Promise<{ subscriberId: string; passwordHash: string | null } | null> {
    const rows = await db
      .select({
        subscriberId: subscribers.id,
        passwordHash: subscribers.passwordHash,
      })
      .from(subscriberIdentities)
      .innerJoin(subscribers, eq(subscribers.id, subscriberIdentities.subscriberId))
      .where(
        and(
          eq(subscriberIdentities.kind, IdentityKind.Phone),
          eq(subscriberIdentities.value, phone),
        ),
      )
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

  async insertPhoneIdentity(
    db: Executor,
    values: { subscriberId: string; phone: string; verifiedAt: Date },
  ): Promise<string> {
    const [row] = await db
      .insert(subscriberIdentities)
      .values({
        subscriberId: values.subscriberId,
        kind: IdentityKind.Phone,
        value: values.phone,
        verifiedAt: values.verifiedAt,
      })
      .returning({ id: subscriberIdentities.id });
    if (!row) throw new Error('insert returned no identity');
    return row.id;
  }

  async findPhoneIdentityOf(
    db: Executor,
    subscriberId: string,
  ): Promise<{ id: string; phone: string } | null> {
    const rows = await db
      .select({ id: subscriberIdentities.id, phone: subscriberIdentities.value })
      .from(subscriberIdentities)
      .where(
        and(
          eq(subscriberIdentities.subscriberId, subscriberId),
          eq(subscriberIdentities.kind, IdentityKind.Phone),
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

  async findPhoneIdentity(
    db: Executor,
    phone: string,
  ): Promise<{ id: string; subscriberId: string } | null> {
    const rows = await db
      .select({ id: subscriberIdentities.id, subscriberId: subscriberIdentities.subscriberId })
      .from(subscriberIdentities)
      .where(
        and(
          eq(subscriberIdentities.kind, IdentityKind.Phone),
          eq(subscriberIdentities.value, phone),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }
}
