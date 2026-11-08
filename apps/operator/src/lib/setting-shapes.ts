import { PlatformSettingKey } from '@lytronix/validators';

export type SettingUnit =
  | 'days'
  | 'taka'
  | 'minutes'
  | 'percent'
  | 'perMinute'
  | 'mb'
  | 'seconds'
  | 'choice'
  | 'text'
  | 'list'
  | 'version'
  | 'hours'
  // AI-10: which AI reads a pasted message, and its model's name as the AI writes it.
  | 'ai'
  | 'model';

export interface SettingShape {
  key: string;
  /** Which of the page's thirteen groups it sits in (OPERATOR-CONSOLE-DESIGN §9, v5's four Phase 6 and 7 groups). */
  group: number;
  unit: SettingUnit;
}

export const SETTING_GROUPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;

const { TrialDays, TopUpMinAmount, TopUpMaxAmount, GraceDays, ReadOnlyDays, LockedDays } =
  PlatformSettingKey;

/** Every platform setting: its place on the page and what its number counts. The one list Settings and Today read. */
export const SETTING_SHAPES: readonly SettingShape[] = [
  { key: TrialDays, group: 1, unit: 'days' },
  { key: TopUpMinAmount, group: 1, unit: 'taka' },
  { key: TopUpMaxAmount, group: 1, unit: 'taka' },
  { key: GraceDays, group: 2, unit: 'days' },
  { key: ReadOnlyDays, group: 2, unit: 'days' },
  { key: LockedDays, group: 2, unit: 'days' },
  { key: PlatformSettingKey.ArchivedDays, group: 2, unit: 'days' },
  { key: PlatformSettingKey.ReservationExpiryMinutes, group: 3, unit: 'minutes' },
  { key: PlatformSettingKey.OrderLimitMode, group: 3, unit: 'choice' },
  { key: PlatformSettingKey.UsageGracePercent, group: 4, unit: 'percent' },
  { key: PlatformSettingKey.FastSpendPercent, group: 4, unit: 'percent' },
  { key: PlatformSettingKey.PublicRequestsPerVisitorPerMinute, group: 4, unit: 'perMinute' },
  { key: PlatformSettingKey.PublicOrdersPerShopPerMinute, group: 4, unit: 'perMinute' },
  { key: PlatformSettingKey.PaymentSessionsPerShopPerMinute, group: 4, unit: 'perMinute' },
  { key: PlatformSettingKey.NewShopPaymentCapAmount, group: 5, unit: 'taka' },
  { key: PlatformSettingKey.NewShopPaymentCapDays, group: 5, unit: 'days' },
  { key: PlatformSettingKey.ListenerOfflineMinutes, group: 6, unit: 'minutes' },
  { key: PlatformSettingKey.ListenerMinAppVersion, group: 6, unit: 'text' },
  { key: PlatformSettingKey.ListenerSenders, group: 6, unit: 'list' },
  { key: PlatformSettingKey.MediaImageMaxMb, group: 7, unit: 'mb' },
  { key: PlatformSettingKey.MediaVideoMaxMb, group: 7, unit: 'mb' },
  { key: PlatformSettingKey.CatalogueListMaxAgeSeconds, group: 8, unit: 'seconds' },
  { key: PlatformSettingKey.CatalogueListStaleSeconds, group: 8, unit: 'seconds' },
  { key: PlatformSettingKey.CatalogueDetailMaxAgeSeconds, group: 8, unit: 'seconds' },
  { key: PlatformSettingKey.CatalogueSearchMaxAgeSeconds, group: 8, unit: 'seconds' },
  { key: PlatformSettingKey.CatalogueCategoriesMaxAgeSeconds, group: 8, unit: 'seconds' },
  { key: PlatformSettingKey.TermsVersion, group: 9, unit: 'version' },
  { key: PlatformSettingKey.PrivacyVersion, group: 9, unit: 'version' },
  // CRR-14, CRR-15 (Phase 6): keeping calls to couriers down.
  { key: PlatformSettingKey.CourierCheckMinAgeHours, group: 10, unit: 'hours' },
  { key: PlatformSettingKey.CourierCheckQuietHours, group: 10, unit: 'hours' },
  { key: PlatformSettingKey.CourierCheckStopDays, group: 10, unit: 'days' },
  { key: PlatformSettingKey.CourierSyncMinutes, group: 10, unit: 'minutes' },
  // AI-10, ORD-33 (Slice 7.6): reading delivery details from a message.
  { key: PlatformSettingKey.AddressReadProvider, group: 11, unit: 'ai' },
  { key: PlatformSettingKey.AddressReadModel, group: 11, unit: 'model' },
  { key: PlatformSettingKey.AddressReadsPerShopPerMinute, group: 11, unit: 'perMinute' },
  // FRD-07 (Slice 7.5).
  { key: PlatformSettingKey.FraudChecksPerShopPerMinute, group: 12, unit: 'perMinute' },
  // NTF-01, D7-39 (Slice 7.3).
  { key: PlatformSettingKey.NotificationRetentionDays, group: 13, unit: 'days' },
];

export function settingUnitOf(key: string): SettingUnit | undefined {
  return SETTING_SHAPES.find((shape) => shape.key === key)?.unit;
}
