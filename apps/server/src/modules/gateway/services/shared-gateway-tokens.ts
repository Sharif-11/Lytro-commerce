import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { SecretBox, SecretPurpose } from '../../shared/secrets/secret-box';
import { Leases, type Held } from '../../shared/limits/services/leases';
import { LIMITS_REDIS } from '../../shared/limits/tokens';
import type { GatewayAccount } from '../ports/wallet-gateway';

/** A wallet account's token as bKash gave it, and when to ask for a fresh one. */
export interface SharedToken {
  idToken: string;
  refreshToken: string;
  refreshAfter: number;
}

// The turn to ask bKash for a token: long enough to cover its timeouts; a process waits this long for another's.
const TURN_LEASE_MS = 30_000;
const TURN_WAIT_MS = 20_000;
// A shared token is kept a little past the moment it should be refreshed, so another process can refresh it rather
// than ask for a new grant.
const KEEP_PAST_REFRESH_MS = 5 * 60_000;

/**
 * §107 (Slice 9.4): one token per wallet account for every API copy, the worker and every server, since bKash blocks an
 * app for an hour past [2] token calls in an hour and each process asking for its own would pass that. A token is kept
 * sealed in the shared Redis (SEC-01: bound to its shop), so Redis never holds a readable credential; one process at a
 * time asks bKash for it, under the account's lease. Without Redis each process keeps its own, as before, and the turn
 * still counts every call exactly.
 */
@Injectable()
export class SharedGatewayTokens {
  private readonly log = new Logger(SharedGatewayTokens.name);

  constructor(
    @Inject(LIMITS_REDIS) private readonly redis: Redis | null,
    @Inject(SecretBox) private readonly box: Pick<SecretBox, 'seal' | 'open'>,
    @Inject(Leases) private readonly leases: Pick<Leases, 'inTurn'>,
  ) {}

  /** The shared token, or null with none kept, none readable, or no Redis. */
  async get(account: GatewayAccount): Promise<SharedToken | null> {
    if (!this.redis) return null;
    try {
      const sealed = await this.redis.get(keyOf(account.accountId));
      if (!sealed) return null;
      const plain = this.box.open(
        Buffer.from(sealed, 'base64'),
        SecretPurpose.GatewayToken,
        account.tenantId,
      );
      return JSON.parse(plain) as SharedToken;
    } catch (error) {
      this.log.warn(`no shared gateway token (${String(error)})`);
      return null;
    }
  }

  async put(account: GatewayAccount, token: SharedToken, now: Date): Promise<void> {
    if (!this.redis) return;
    try {
      const sealed = this.box.seal(
        JSON.stringify(token),
        SecretPurpose.GatewayToken,
        account.tenantId,
      );
      const keepMs = Math.max(token.refreshAfter - now.getTime(), 0) + KEEP_PAST_REFRESH_MS;
      await this.redis.set(keyOf(account.accountId), sealed.toString('base64'), 'PX', keepMs);
    } catch (error) {
      this.log.warn(`could not share the gateway token (${String(error)})`);
    }
  }

  /** WAL-12: the account's credentials changed or it went: its token is forgotten everywhere. */
  async forget(accountId: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(keyOf(accountId));
    } catch (error) {
      this.log.warn(`could not forget the gateway token (${String(error)})`);
    }
  }

  /** The account's turn to ask bKash for a token, one process at a time. */
  inTurn<T>(accountId: string, work: () => Promise<T>): Promise<Held<T>> {
    return this.leases.inTurn(`gateway-token:${accountId}`, TURN_LEASE_MS, TURN_WAIT_MS, work);
  }
}

function keyOf(accountId: string): string {
  return `lytro:gateway-token:${accountId}`;
}
