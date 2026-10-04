import { IdentityKind } from '@lytronix/validators';
import { and, eq } from 'drizzle-orm';
import type { Executor } from '../../transactions';
import { subscriberIdentities, subscribers } from '../../schema';

// AUTH-08: a phone belongs to at most one subscriber. The unique index on (kind, value) enforces it; a violation
// surfaces as a unique-violation error, which the server maps to a clear answer.
export class AccountRepository {
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
