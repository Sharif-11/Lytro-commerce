import { randomBytes, randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { ListenerShopRow, SelectListenerPairingCode, Transaction } from '@lytronix/db';
import {
  ActorType,
  AuditAction,
  LISTENER_CODE_ALPHABET,
  LISTENER_CODE_LENGTH,
  LISTENER_CODE_MINUTES,
  LISTENER_CODE_TRIES_MAX,
  LISTENER_HEARTBEAT_MINUTES,
  LISTENER_TOKEN_BYTES,
  PlatformActorType,
  PlatformAuditAction,
  type ListenerPairInput,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { MINUTE_MS } from '../../../common/time';
import { CatalogueActivity, type ResolvedActor } from '../../catalogue/services/catalogue-activity';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import type { ListenerStore } from '../ports/listener-store';
import { LISTENER_CLOCK, LISTENER_STORE } from '../tokens';
import type { ListenerCode, ListenerPaired } from '../types/listener';
import { ListenerLimits } from './listener-limits';
import { ListenerRules, listenerHashOf } from './listener-rules';

/** LSN-09: [8] characters from an alphabet that reads aloud without mistakes. */
function codeOf(): string {
  let code = '';
  for (let index = 0; index < LISTENER_CODE_LENGTH; index += 1) {
    code += LISTENER_CODE_ALPHABET.charAt(randomInt(LISTENER_CODE_ALPHABET.length));
  }
  return code;
}

/** A pairing step's end: refused, with what was written for the refusal kept, or done. */
type Outcome<T> = { refused: ApiError } | { done: T };

/** LSN-01: a code pairs only while it is not spent, voided or run out. */
function isOpen(code: SelectListenerPairingCode, now: Date): boolean {
  return code.usedAt === null && code.voidedAt === null && code.expiresAt > now;
}

/**
 * LSN-01, LSN-07 to LSN-11, LSN-22 (Phase 5 Slice 5.4a, read agreed 2026-11-01): pairing a listener phone. The owner,
 * or staff with listener:manage, makes a code -- single use, open [10] minutes, kept only as its hash -- for a shop that
 * may use the listener and has a phone left on its plan. The app pairs with it: the code's shop must still qualify at
 * that moment, the installation must not be blocked, and the plan's limit must leave room; then the device is made
 * with a token of [32] random bytes, bound to the shop and the installation, shown this once. A refusal counts against
 * the caller (LSN-10) and, for a code it found, against the code, void after [10]; a limit refusal is in both logs.
 */
@Injectable()
export class ListenerPairing {
  constructor(
    @Inject(LISTENER_STORE) private readonly store: ListenerStore,
    @Inject(ListenerRules) private readonly rules: ListenerRules,
    @Inject(ListenerLimits) private readonly limits: ListenerLimits,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(LISTENER_CLOCK) private readonly clock: () => Date,
  ) {}

  /** LSN-01, LSN-09: a new code for the shop, refused while the shop may not listen or its phones are all paired. */
  async createCode(tenantId: string, actor: CatalogueActor): Promise<ListenerCode> {
    const who = await this.activity.resolve(tenantId, actor);
    const now = this.clock();
    const outcome = await this.store.run<Outcome<ListenerCode>>(async (tx) => {
      this.rules.refuseInactive(await this.store.shopOf(tx, tenantId));
      const full = await this.fullWithin(tx, tenantId, who, {
        type: PlatformActorType.System,
        id: null,
      });
      if (full) return { refused: full };
      const code = codeOf();
      const row = await this.store.insertCode(tx, {
        tenantId,
        codeHash: listenerHashOf(code),
        createdBy: who.id,
        expiresAt: new Date(now.getTime() + LISTENER_CODE_MINUTES * MINUTE_MS),
      });
      return { done: { code, expiresAt: row.expiresAt } };
    });
    if ('refused' in outcome) throw outcome.refused;
    return outcome.done;
  }

  /** LSN-01, LSN-11: the app pairing with a code; its token, shown this once. */
  async pair(
    input: ListenerPairInput,
    appVersion: string | undefined,
    ip: string | null,
  ): Promise<ListenerPaired> {
    const now = this.clock();
    const caller = ip ?? 'unknown';
    this.limits.refusePairing(caller, now);
    const version = await this.rules.refuseOldApp(appVersion);
    const outcome = await this.store.run<Outcome<ListenerPaired>>(async (tx) => {
      const code = await this.store.lockCode(tx, listenerHashOf(input.code));
      if (!code || !isOpen(code, now)) {
        return { refused: new ApiError('not_found', 'ListenerCodeInvalid', {}) };
      }
      const actor: ResolvedActor =
        code.createdBy === null
          ? { id: null, ip, type: ActorType.System }
          : { id: code.createdBy, ip, type: ActorType.User };
      const shop = await this.store.shopOf(tx, code.tenantId);
      const refused = await this.refusalOf(tx, code.tenantId, shop, input.installationId, actor);
      if (refused) {
        await this.store.addTry(tx, code.id, LISTENER_CODE_TRIES_MAX, now);
        return { refused };
      }
      const token = randomBytes(LISTENER_TOKEN_BYTES).toString('base64url');
      const device = await this.store.insertDevice(tx, {
        tenantId: code.tenantId,
        name: input.name ?? input.model ?? 'Listener phone',
        model: input.model ?? null,
        appVersion: version,
        installationId: input.installationId,
        tokenHash: listenerHashOf(token),
        pairedBy: code.createdBy,
      });
      await this.store.spendCode(tx, code.id, now);
      await this.rules.recordBoth(tx, {
        tenantId: code.tenantId,
        actor,
        platformActor: { type: PlatformActorType.System, id: null },
        action: AuditAction.ListenerDevicePaired,
        platformAction: PlatformAuditAction.ListenerDevicePaired,
        deviceId: device.id,
        summary: { name: device.name, model: device.model, appVersion: device.appVersion },
      });
      return {
        done: {
          deviceId: device.id,
          token,
          shopName: shop?.shopName ?? '',
          heartbeatMinutes: LISTENER_HEARTBEAT_MINUTES,
        },
      };
    });
    if ('refused' in outcome) {
      this.limits.failedPairing(caller, now);
      throw outcome.refused;
    }
    return outcome.done;
  }

  /** LSN-07, LSN-08, LSN-21: why a found code may not pair now, or null when it may. */
  private async refusalOf(
    tx: Transaction,
    tenantId: string,
    shop: ListenerShopRow | null,
    installationId: string,
    actor: ResolvedActor,
  ): Promise<ApiError | null> {
    if (await this.store.isBlocked(tx, installationId)) {
      return new ApiError('forbidden', 'ListenerInstallationBlocked', {});
    }
    if (!this.rules.isListening(shop)) {
      return new ApiError('tenant_offline', 'ListenerShopInactive', {});
    }
    return this.fullWithin(tx, tenantId, actor, { type: PlatformActorType.System, id: null });
  }

  /** LSN-08: the refusal when the shop's phones fill its plan's limit -- written to both logs -- or null. */
  private async fullWithin(
    tx: Transaction,
    tenantId: string,
    actor: ResolvedActor,
    platformActor: { type: PlatformActorType; id: string | null },
  ): Promise<ApiError | null> {
    const limit = await this.rules.deviceLimit(tenantId);
    if (limit === null) return null;
    const active = await this.store.countLive(tx, tenantId);
    if (active < limit) return null;
    await this.rules.recordBoth(tx, {
      tenantId,
      actor,
      platformActor,
      action: AuditAction.ListenerLimitRefused,
      platformAction: PlatformAuditAction.ListenerLimitRefused,
      deviceId: null,
      summary: { limit, active },
    });
    return new ApiError('plan_limit_reached', 'ListenerDeviceLimit', { limit });
  }
}
