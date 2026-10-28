import { useTranslation } from 'react-i18next';
import { StatusTag } from '@/components/ui/status-tag';
import type { CatalogueScope } from '@/types/attribute';

/** ATL-01: the library's, shared by every shop, or the shop's own, as a row's tag says it (the prototype's `ATTRS`). */
export function ScopeTag({ scope }: { scope: CatalogueScope }): React.JSX.Element {
  const { t } = useTranslation('shop');
  return scope === 'shop' ? (
    <StatusTag tone="info">{t('own')}</StatusTag>
  ) : (
    <StatusTag tone="neutral">{t('library')}</StatusTag>
  );
}
