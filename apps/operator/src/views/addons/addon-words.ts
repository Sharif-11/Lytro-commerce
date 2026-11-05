import type { TFunction } from 'i18next';
import { limitLabelKey } from '@/lib/limit-keys';
import type { OperatorAddon } from '@/types/operator';

/** What one bought unit adds, in the words a shop thinks in: 1 GB, 10 GB, 500. */
export function unitWords(addon: Pick<OperatorAddon, 'limitKey' | 'unitSize'>): string {
  if (addon.unitSize === null) return '—';
  if (addon.limitKey === 'storage_mb') return `${String(addon.unitSize / 1024)} GB`;
  if (addon.limitKey === 'bandwidth_gb') return `${String(addon.unitSize)} GB`;
  return addon.unitSize.toLocaleString('en-US');
}

export function raisesWords(limitKey: string | null, t: TFunction): string {
  return limitKey === null ? t('addonKinds.feature') : t(limitLabelKey(limitKey));
}

/** The item's name in the page's language. */
export function addonName(
  addon: Pick<OperatorAddon, 'labelEn' | 'labelBn'>,
  language: string,
): string {
  return language === 'bn' ? addon.labelBn : addon.labelEn;
}
