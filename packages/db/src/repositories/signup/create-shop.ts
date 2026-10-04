import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../../client';
import {
  plans,
  smsOutbox,
  subscriberIdentities,
  subscribers,
  tenants,
  users,
  verificationChallenges,
} from '../../schema';

// AUTH-08, AUTH-10, TEN-15: creates the subscriber, the verified phone, the trial shop and the owner user in one
// transaction. A failure at any step rolls everything back, so no half-created account can remain (test plan risk).

export type SignupConflictReason = 'challenge_used' | 'phone_registered' | 'address_taken';

export class SignupConflict extends Error {
  constructor(readonly reason: SignupConflictReason) {
    super(reason);
    this.name = 'SignupConflict';
  }
}

export interface CreateShopInput {
  challengeId: string;
  phone: string;
  ownerName: string;
  shopName: string;
  slug: string;
  shopReadyBody: (liveUrl: string) => string;
  liveUrl: string;
  now: Date;
}

export interface CreatedShop {
  tenantId: string;
  subscriberId: string;
}

const TRIAL_DAYS = 30;

export async function createShopForVerifiedPhone(
  db: Database,
  input: CreateShopInput,
): Promise<CreatedShop> {
  try {
    return await db.transaction(async (tx) => {
      // Consume the code first, in the same transaction: a second request with the same code finds no row.
      const consumed = await tx
        .update(verificationChallenges)
        .set({ consumedAt: input.now })
        .where(
          and(
            eq(verificationChallenges.id, input.challengeId),
            isNull(verificationChallenges.consumedAt),
          ),
        )
        .returning({ id: verificationChallenges.id });
      if (consumed.length === 0) throw new SignupConflict('challenge_used');

      const [trial] = await tx
        .select({ id: plans.id, limits: plans.limits })
        .from(plans)
        .where(and(eq(plans.name, 'Trial'), eq(plans.forSale, false)))
        .limit(1);
      if (!trial) throw new Error('the Trial plan is not seeded');

      const [subscriber] = await tx
        .insert(subscribers)
        .values({})
        .returning({ id: subscribers.id });
      if (!subscriber) throw new Error('insert returned no subscriber');

      const [identity] = await tx
        .insert(subscriberIdentities)
        .values({
          subscriberId: subscriber.id,
          kind: 'phone',
          value: input.phone,
          verifiedAt: input.now,
        })
        .returning({ id: subscriberIdentities.id });
      if (!identity) throw new Error('insert returned no identity');

      const periodEnd = new Date(input.now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      const [tenant] = await tx
        .insert(tenants)
        .values({
          ownerIdentityId: identity.id,
          subscriberId: subscriber.id,
          shopName: input.shopName,
          slug: input.slug,
          planId: trial.id,
          planSnapshot: trial.limits,
          periodStart: input.now,
          periodEnd,
        })
        .returning({ id: tenants.id });
      if (!tenant) throw new Error('insert returned no tenant');

      // Row-level security applies to the owner user, so the tenant context is set before the insert.
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenant.id}, true)`);
      await tx.insert(users).values({
        tenantId: tenant.id,
        phone: input.phone,
        name: input.ownerName,
        isOwner: true,
      });

      await tx.insert(smsOutbox).values({
        toPhone: input.phone,
        kind: 'shop_ready',
        body: input.shopReadyBody(input.liveUrl),
      });

      return { tenantId: tenant.id, subscriberId: subscriber.id };
    });
  } catch (error) {
    throw mapConflict(error);
  }
}

/** Turns the two unique-constraint violations a race can produce into named reasons. Anything else passes through. */
function mapConflict(error: unknown): unknown {
  if (error instanceof SignupConflict) return error;
  const pgError = (error instanceof Error && error.cause ? error.cause : error) as {
    code?: string;
    constraint?: string;
  };
  if (pgError.code === '23505') {
    if (pgError.constraint?.includes('kind_value')) return new SignupConflict('phone_registered');
    if (pgError.constraint?.includes('tenants_slug')) return new SignupConflict('address_taken');
  }
  return error;
}
