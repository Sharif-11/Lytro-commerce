import { Inject, Injectable } from '@nestjs/common';
import {
  PlatformActorType,
  PlatformAuditAction,
  AuditResult,
  type RateKey,
  FieldProblemCode,
} from '@lytronix/validators';
import { FieldsError } from '../../../common/api-error';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import type { RateStore } from '../ports/rate-store';
import { RATE_STORE } from '../tokens';
import { RateCache } from './rate-cache';
import type { RateHistoryEntry, RateValue } from '../types/rate';

/**
 * Reads and changes platform-wide, per-use rates (RAT-01 to RAT-14). A charge always reads the current rate at
 * the moment it is recorded (RAT-04); a change never alters a past entry (RAT-03), since this only ever writes
 * the current value and appends to the history, never touching tenant.balance_ledger.
 */
@Injectable()
export class RateService {
  // Not a constructor parameter: a bare default-valued parameter reflects as design type `Object`, which Nest
  // tries (and fails) to resolve as a provider token. A plain field needs no DI token at all.
  private readonly cache = new RateCache();

  constructor(
    @Inject(RATE_STORE) private readonly store: RateStore,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
  ) {}

  /** RAT-06: the "current rates" page, and the value a charge should use right now. */
  async current(key: RateKey): Promise<RateValue | null> {
    const cached = this.cache.get(key);
    if (cached) return cached;
    const value = await this.store.get(key);
    if (value) this.cache.set(key, value);
    return value;
  }

  async list(): Promise<RateValue[]> {
    return this.store.list();
  }

  async history(key: RateKey): Promise<RateHistoryEntry[]> {
    return this.store.history(key);
  }

  /** RAT-02, RAT-05, RAT-08: non-negative, two-decimal, audited, effective immediately. */
  async change(
    key: RateKey,
    newValue: string,
    operatorId: string,
    noticeId: string | null,
  ): Promise<void> {
    const numeric = Number(newValue);
    if (!Number.isFinite(numeric) || numeric < 0) {
      throw new FieldsError([
        {
          field: 'value',
          problem: FieldProblemCode.TooSmall,
          min: 0,
          messageKey: 'RateCannotBeNegative',
        },
      ]);
    }
    const current = await this.store.get(key);
    // RAT-02 and ADM-08: the new value, its history row and the platform audit entry commit together.
    await this.store.run(async (tx) => {
      await this.store.set(tx, key, current?.value ?? null, newValue, operatorId, noticeId);
      await this.platformAudit.recordWithin(tx, {
        actorType: PlatformActorType.Operator,
        actorId: operatorId,
        action: PlatformAuditAction.RateChanged,
        targetType: 'rate',
        targetId: null,
        result: AuditResult.Success,
        ip: null,
        summary: { key, oldValue: current?.value ?? null, newValue, noticeId },
      });
    });
    // RAT-02: effective immediately, not after the cache's own TTL expires. After the commit, so nothing can read
    // the old value back into the cache in between.
    this.cache.invalidate(key);
  }
}
