import { Inject, Injectable } from '@nestjs/common';
import {
  AuditResult,
  PlatformActorType,
  PlatformAuditAction,
  PlatformSettingKey,
  FieldProblemCode,
} from '@lytronix/validators';
import { FieldsError } from '../../../common/api-error';
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
  [PlatformSettingKey.GraceDays]: 'How many days of grace a lapsed tenant gets (LIF-26, 2.3).',
  [PlatformSettingKey.ReadOnlyDays]:
    'How many days after grace a lapsed tenant stays read-only (LIF-26, 2.3).',
  [PlatformSettingKey.LockedDays]:
    'How many days after read-only a lapsed tenant stays locked (LIF-26, 2.3).',
  [PlatformSettingKey.ArchivedDays]:
    'How many days after locked a lapsed tenant stays archived before deletion (LIF-26, 2.3).',
  [PlatformSettingKey.ReservationExpiryMinutes]:
    'How many minutes an order awaiting online payment holds its stock (INV-16).',
  [PlatformSettingKey.MediaImageMaxMb]: 'The largest image one upload may be, in MB (STO-04).',
  [PlatformSettingKey.MediaVideoMaxMb]: 'The largest video one upload may be, in MB (STO-05).',
  [PlatformSettingKey.CatalogueListMaxAgeSeconds]:
    "How long a shopper's browser keeps a product list, in seconds (CCH-03).",
  [PlatformSettingKey.CatalogueListStaleSeconds]:
    'How long an older product list may still be shown while it is fetched again, in seconds (CCH-03).',
  [PlatformSettingKey.CatalogueDetailMaxAgeSeconds]:
    "How long a shopper's browser keeps a product page, in seconds (CCH-03).",
  [PlatformSettingKey.CatalogueSearchMaxAgeSeconds]:
    "How long a shopper's browser keeps search results, in seconds (CCH-03).",
  [PlatformSettingKey.CatalogueCategoriesMaxAgeSeconds]:
    "How long a shopper's browser keeps the category tree, in seconds (CCH-03).",
  [PlatformSettingKey.PublicRequestsPerVisitorPerMinute]:
    'How many requests one visitor may make to one shop in a minute, through its public keys (RTE-06).',
  [PlatformSettingKey.UsageGracePercent]:
    'How far past its bandwidth or API request limit a shop is still served, as a percent of the limit (BND-03, RTE-03).',
  [PlatformSettingKey.FastSpendPercent]:
    "The share of a cycle's API requests that, spent in one hour, alerts the owner and the operator (RTE-12).",
};

// A positive-int check, the only shape any key needs today; slice 7 extends this map, not a switch, as more
// keys with different value shapes arrive (avoids an exhaustive switch with only one real case for now).
const isPositiveInt = (value: unknown): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

const VALIDATORS: Record<PlatformSettingKey, (value: unknown) => boolean> = {
  [PlatformSettingKey.TrialDays]: isPositiveInt,
  [PlatformSettingKey.TopUpMinAmount]: isPositiveInt,
  [PlatformSettingKey.TopUpMaxAmount]: isPositiveInt,
  [PlatformSettingKey.GraceDays]: isPositiveInt,
  [PlatformSettingKey.ReadOnlyDays]: isPositiveInt,
  [PlatformSettingKey.LockedDays]: isPositiveInt,
  [PlatformSettingKey.ArchivedDays]: isPositiveInt,
  [PlatformSettingKey.ReservationExpiryMinutes]: isPositiveInt,
  [PlatformSettingKey.MediaImageMaxMb]: isPositiveInt,
  [PlatformSettingKey.MediaVideoMaxMb]: isPositiveInt,
  [PlatformSettingKey.CatalogueListMaxAgeSeconds]: isPositiveInt,
  [PlatformSettingKey.CatalogueListStaleSeconds]: isPositiveInt,
  [PlatformSettingKey.CatalogueDetailMaxAgeSeconds]: isPositiveInt,
  [PlatformSettingKey.CatalogueSearchMaxAgeSeconds]: isPositiveInt,
  [PlatformSettingKey.CatalogueCategoriesMaxAgeSeconds]: isPositiveInt,
  [PlatformSettingKey.PublicRequestsPerVisitorPerMinute]: isPositiveInt,
  [PlatformSettingKey.UsageGracePercent]: isPositiveInt,
  [PlatformSettingKey.FastSpendPercent]: isPositiveInt,
};

function validate(key: PlatformSettingKey, value: unknown): void {
  if (!VALIDATORS[key](value)) {
    throw new FieldsError([
      {
        field: 'value',
        problem: FieldProblemCode.InvalidFormat,
        messageKey: 'SettingValueInvalid',
      },
    ]);
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
    // ADM-08: the change and its platform audit entry commit together or not at all.
    await this.store.run(async (tx) => {
      await this.store.set(tx, key, value, DESCRIPTIONS[key], operatorId);
      await this.platformAudit.recordWithin(tx, {
        actorType: PlatformActorType.Operator,
        actorId: operatorId,
        action: PlatformAuditAction.SettingsChanged,
        targetType: 'setting',
        targetId: null,
        result: AuditResult.Success,
        ip: null,
        summary: { key, oldValue: current?.value ?? null, newValue: value },
      });
    });
    // After the commit, so nothing can read the old value back into the cache in between.
    this.cache.invalidate(key);
  }
}
