import { Inject, Injectable } from '@nestjs/common';
import {
  AuditResult,
  PlatformActorType,
  PlatformAuditAction,
  PlatformSettingKey,
  FieldProblemCode,
  OrderLimitMode,
  appVersionField,
  LISTENER_SENDER_MAX_LENGTH,
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
  [PlatformSettingKey.PublicOrdersPerShopPerMinute]:
    'How many orders shoppers may place in one shop in a minute, every plan alike (RTE-08).',
  [PlatformSettingKey.ListenerOfflineMinutes]:
    'How many minutes after its last report a listener phone counts offline (LSN-03, VER-07).',
  [PlatformSettingKey.CourierCheckMinAgeHours]:
    'How many hours old a parcel must be before the night check asks after it (CRR-15).',
  [PlatformSettingKey.CourierCheckQuietHours]:
    'How many hours without a courier message before the night check asks after a parcel (CRR-15).',
  [PlatformSettingKey.CourierCheckStopDays]:
    'How many days with no change before a parcel stops being checked and shows no news (CRR-15).',
  [PlatformSettingKey.CourierSyncMinutes]:
    'How many minutes a Sync shows its saved answer before it may ask the courier again (CRR-14).',
  [PlatformSettingKey.ListenerMinAppVersion]:
    'The oldest listener app version that may call, as 1.2.3; older apps must update (LSN-18).',
  [PlatformSettingKey.ListenerSenders]:
    'The senders whose SMS count as a wallet\'s, for every shop, as a list like ["bKash"] (LSN-16).',
  [PlatformSettingKey.NewShopPaymentCapAmount]:
    "The most a new shop's online payments may come to in a day, in TK, where the new-shop cap holds (TVR-04).",
  [PlatformSettingKey.NewShopPaymentCapDays]:
    'How many days a shop counts as new for the new-shop payment cap (TVR-04).',
  [PlatformSettingKey.PaymentSessionsPerShopPerMinute]:
    'How many payments shoppers may open in one shop in a minute, every plan alike (RTE-08).',
  [PlatformSettingKey.OrderLimitMode]:
    "Past the period's order-handling limit: block, or allow with a prompt to upgrade (QTA-03).",
  [PlatformSettingKey.TermsVersion]:
    'The terms of service in force, which a new account accepts: change it when new terms are published (LEG-01).',
  [PlatformSettingKey.PrivacyVersion]:
    'The privacy policy in force, which a new account accepts: change it when a new policy is published (LEG-01).',
};

// A positive-int check, the only shape any key needs today; slice 7 extends this map, not a switch, as more
// keys with different value shapes arrive (avoids an exhaustive switch with only one real case for now).
const isPositiveInt = (value: unknown): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;
const isAppVersion = (value: unknown): boolean => appVersionField.safeParse(value).success;
// LEG-01: a version's name, such as a date.
const isLegalVersion = (value: unknown): boolean =>
  typeof value === 'string' && value.trim() !== '' && value.length <= 40;
// LSN-16: a list of senders, each as an SMS names it.
const isSenderList = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (sender) =>
      typeof sender === 'string' &&
      sender.trim().length > 0 &&
      sender.length <= LISTENER_SENDER_MAX_LENGTH,
  );
const isOrderLimitMode = (value: unknown): boolean =>
  Object.values<unknown>(OrderLimitMode).includes(value);

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
  [PlatformSettingKey.PublicOrdersPerShopPerMinute]: isPositiveInt,
  [PlatformSettingKey.PaymentSessionsPerShopPerMinute]: isPositiveInt,
  [PlatformSettingKey.NewShopPaymentCapAmount]: isPositiveInt,
  [PlatformSettingKey.ListenerOfflineMinutes]: isPositiveInt,
  [PlatformSettingKey.CourierCheckMinAgeHours]: isPositiveInt,
  [PlatformSettingKey.CourierCheckQuietHours]: isPositiveInt,
  [PlatformSettingKey.CourierCheckStopDays]: isPositiveInt,
  [PlatformSettingKey.CourierSyncMinutes]: isPositiveInt,
  [PlatformSettingKey.ListenerMinAppVersion]: isAppVersion,
  [PlatformSettingKey.ListenerSenders]: isSenderList,
  [PlatformSettingKey.NewShopPaymentCapDays]: isPositiveInt,
  [PlatformSettingKey.OrderLimitMode]: isOrderLimitMode,
  [PlatformSettingKey.TermsVersion]: isLegalVersion,
  [PlatformSettingKey.PrivacyVersion]: isLegalVersion,
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

  async set(
    key: PlatformSettingKey,
    value: unknown,
    operatorId: string,
    reason: string | null = null,
  ): Promise<void> {
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
        summary: { key, oldValue: current?.value ?? null, newValue: value, reason },
      });
    });
    // After the commit, so nothing can read the old value back into the cache in between.
    this.cache.invalidate(key);
  }
}
