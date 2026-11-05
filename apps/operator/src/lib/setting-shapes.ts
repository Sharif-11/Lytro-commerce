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
  | 'version';

export interface SettingShape {
  key: string;
  /** Which of the page's nine groups it sits in (OPERATOR-CONSOLE-DESIGN §9). */
  group: number;
  unit: SettingUnit;
}

export const SETTING_GROUPS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

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
];

export function settingUnitOf(key: string): SettingUnit | undefined {
  return SETTING_SHAPES.find((shape) => shape.key === key)?.unit;
}
