import type { TFunction } from 'i18next';
import {
  cloudflarePricesSchema,
  DEFAULT_CLOUDFLARE_PRICES,
  type CloudflarePrices,
} from '@lytronix/validators';
import { isUnset, settingUnitOf, type SettingUnit } from './setting-shapes';
import { taka } from './format';
import { usd } from './usd';

/** The units that count something: the server takes a whole number of 1 or more for each. */
export const COUNTED: readonly SettingUnit[] = [
  'days',
  'minutes',
  'percent',
  'perMinute',
  'mb',
  'seconds',
  'hours',
  'dayOfMonth',
  'usd',
];

/** D8-68: an hour of the help line as a 24-hour time, "09:00". */
export const hourWords = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;

/** D8-60: Cloudflare's prices as stored, read by the one shape the server checks them against. */
export function pricesOf(value: unknown): CloudflarePrices {
  return cloudflarePricesSchema.safeParse(value).data ?? DEFAULT_CLOUDFLARE_PRICES;
}

/** D8-60: Cloudflare's prices in one line, as the media group's row shows them. */
export function pricesWords(value: unknown, t: TFunction): string {
  const prices = pricesOf(value);
  return t('settings.pricesSummary', {
    a: usd(prices.r2ClassAPerMillion),
    b: usd(prices.r2ClassBPerMillion),
    c: `$${String(prices.r2StoragePerGbMonth)}`,
    d: usd(prices.workersMonthly),
  });
}

/** What changed, the unit said once: "7 → 30 days". */
export function settingChangeWords(key: string, from: unknown, to: unknown, t: TFunction): string {
  const unit = settingUnitOf(key);
  const counted = unit !== undefined && COUNTED.includes(unit);
  const before = counted && typeof from === 'number' ? String(from) : settingWords(key, from, t);
  return `${before} → ${settingWords(key, to, t)}`;
}

/** A setting's number with what it counts, or its words: "30 days", "৳100", "Block". */
export function settingWords(key: string, value: unknown, t: TFunction): string {
  const unit = settingUnitOf(key);
  if ((unit === 'phone' || unit === 'email') && isUnset(value)) return t('settings.notSet');
  if (value === null || value === undefined) return '–';
  if (Array.isArray(value)) return value.join(', ');
  const plain = typeof value === 'string' ? value : JSON.stringify(value);
  switch (unit) {
    case 'taka':
      return taka(Number(value));
    case 'choice':
      return t(`settings.orderLimit.${plain}`, { defaultValue: plain });
    case 'ai':
      return t(`settings.aiProviders.${plain}`, { defaultValue: plain });
    case 'hour':
      return hourWords(Number(value));
    case 'usd':
      return `$${plain}`;
    case 'dayOfMonth':
      return t('settings.dayOfMonth', { n: plain });
    case 'prices':
      return pricesWords(value, t);
    case 'days':
    case 'minutes':
    case 'percent':
    case 'perMinute':
    case 'mb':
    case 'seconds':
    case 'hours':
      return `${plain} ${t(`settings.units.${unit}`)}`;
    default:
      return plain;
  }
}
