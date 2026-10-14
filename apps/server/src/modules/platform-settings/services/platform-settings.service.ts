import { Inject, Injectable } from '@nestjs/common';
import {
  AuditResult,
  PlatformActorType,
  PlatformAuditAction,
  PlatformSettingKey,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import type { PlatformSettingsStore } from '../ports/platform-settings-store';
import { PLATFORM_SETTINGS_STORE } from '../tokens';
import { PlatformSettingsCache } from './platform-settings-cache';
import type { PlatformSettingValue } from '../types/platform-setting';

// Every setting this platform exposes, and how to validate a new value for it (LIF-26). Add a case here
// before any code lets an operator set a new key -- one place that knows what "valid" means per key, not
// scattered across callers.
const DESCRIPTIONS: Record<PlatformSettingKey, string> = {
  [PlatformSettingKey.TrialDays]: 'How many days a new shop stays on the Trial plan (TRL-01).',
  [PlatformSettingKey.TopUpMinAmount]:
    'The smallest amount a tenant may top up in one payment, in TK (BAL-04).',
  [PlatformSettingKey.TopUpMaxAmount]:
    'The largest amount a tenant may top up in one payment, in TK (BAL-04).',
};

// A positive-int check, the only shape any key needs today; slice 7 extends this map, not a switch, as more
// keys with different value shapes arrive (avoids an exhaustive switch with only one real case for now).
const isPositiveInt = (value: unknown): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

const VALIDATORS: Record<PlatformSettingKey, (value: unknown) => boolean> = {
  [PlatformSettingKey.TrialDays]: isPositiveInt,
  [PlatformSettingKey.TopUpMinAmount]: isPositiveInt,
  [PlatformSettingKey.TopUpMaxAmount]: isPositiveInt,
};

function validate(key: PlatformSettingKey, value: unknown): void {
  if (!VALIDATORS[key](value)) {
    throw new ApiError('validation_error', 'SettingValueInvalid', { field: 'value' });
  }
}

/**
 * Reads and changes platform-wide settings (LIF-26) -- values that aren't a per-use rate (RateService).
 * A change always takes effect for whatever reads the key next (no retroactive effect on anything already
 * decided from the old value, e.g. a trial already running keeps its own `periodEnd`).
 */
@Injectable()
export class PlatformSettingsService {
  private readonly cache = new PlatformSettingsCache();

  constructor(
    @Inject(PLATFORM_SETTINGS_STORE) private readonly store: PlatformSettingsStore,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
  ) {}

  async current(key: PlatformSettingKey): Promise<PlatformSettingValue | null> {
    const cached = this.cache.get(key);
    if (cached) return cached;
    const value = await this.store.get(key);
    if (value) this.cache.set(key, value);
    return value;
  }

  list(): Promise<PlatformSettingValue[]> {
    return this.store.list();
  }

  async set(key: PlatformSettingKey, value: unknown, operatorId: string): Promise<void> {
    validate(key, value);
    const current = await this.store.get(key);
    await this.store.set(key, value, DESCRIPTIONS[key], operatorId);
    this.cache.invalidate(key);
    await this.platformAudit.record({
      actorType: PlatformActorType.Operator,
      actorId: operatorId,
      action: PlatformAuditAction.SettingsChanged,
      targetType: 'setting',
      targetId: null,
      result: AuditResult.Success,
      ip: null,
      summary: { key, oldValue: current?.value ?? null, newValue: value },
    });
  }
}
