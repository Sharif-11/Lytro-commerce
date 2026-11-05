import type { TFunction } from 'i18next';

/** A limit's value in words: Unlimited for null, thousands separated, on or off for a switch. */
export function limitValue(value: unknown, t: TFunction): string {
  if (value === null || value === undefined) return t('shop.unlimited');
  if (typeof value === 'boolean') return t(value ? 'common.on' : 'common.off');
  return Number(value).toLocaleString('en-US');
}
