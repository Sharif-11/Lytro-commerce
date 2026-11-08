import type { TFunction } from 'i18next';
import { settingUnitOf, type SettingUnit } from './setting-shapes';
import { taka } from './format';

/** The units that count something: the server takes a whole number of 1 or more for each. */
export const COUNTED: readonly SettingUnit[] = [
  'days',
  'minutes',
  'percent',
  'perMinute',
  'mb',
  'seconds',
  'hours',
];

/** What changed, the unit said once: "7 → 30 days". */
export function settingChangeWords(key: string, from: unknown, to: unknown, t: TFunction): string {
  const unit = settingUnitOf(key);
  const counted = unit !== undefined && COUNTED.includes(unit);
  const before = counted && typeof from === 'number' ? String(from) : settingWords(key, from, t);
  return `${before} → ${settingWords(key, to, t)}`;
}

/** A setting's number with what it counts, or its words: "30 days", "৳100", "Block". */
export function settingWords(key: string, value: unknown, t: TFunction): string {
  if (value === null || value === undefined) return '–';
  const unit = settingUnitOf(key);
  if (Array.isArray(value)) return value.join(', ');
  const plain = typeof value === 'string' ? value : JSON.stringify(value);
  switch (unit) {
    case 'taka':
      return taka(Number(value));
    case 'choice':
      return t(`settings.orderLimit.${plain}`, { defaultValue: plain });
    case 'ai':
      return t(`settings.aiProviders.${plain}`, { defaultValue: plain });
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
