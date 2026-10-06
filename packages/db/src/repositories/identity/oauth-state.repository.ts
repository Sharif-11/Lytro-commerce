import type { OauthProvider } from '@lytronix/validators';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Executor } from '../../transactions';
import { oauthStates } from '../../schema';

// AUTH-24: the state and PKCE verifier of each provider sign-in attempt. A state is usable once, and only before it expires.
export class OauthStateRepository {
  async insert(
    db: Executor,
    values: {
      state: string;
      provider: OauthProvider;
      codeVerifier: string;
      expiresAt: Date;
      attachToSubscriberId: string | null;
    },
  ): Promise<void> {
    await db.insert(oauthStates).values(values);
  }

  /** Marks the state used and returns its verifier and target; null when it is unknown, used, expired, or for another provider. */
  async consume(
    db: Executor,
    state: string,
    provider: OauthProvider,
    now: Date,
  ): Promise<{ codeVerifier: string; attachToSubscriberId: string | null } | null> {
    const rows = await db
      .update(oauthStates)
      .set({ consumedAt: now })
      .where(
        and(
          eq(oauthStates.state, state),
          eq(oauthStates.provider, provider),
          isNull(oauthStates.consumedAt),
          gt(oauthStates.expiresAt, now),
        ),
      )
      .returning({
        codeVerifier: oauthStates.codeVerifier,
        attachToSubscriberId: oauthStates.attachToSubscriberId,
      });
    return rows[0] ?? null;
  }
}
