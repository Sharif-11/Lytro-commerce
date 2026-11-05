import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { SMALL_BUTTON } from './sizes';

/** Which page of a long list this is, and the way to the next. Nothing when there is only one. */
export function Pager({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 text-[13px] text-fg-muted">
      <Button
        type="button"
        tone="outline"
        small
        fit
        className={SMALL_BUTTON}
        disabled={page <= 1}
        onClick={() => {
          onPage(page - 1);
        }}
      >
        {t('receipts.previous')}
      </Button>
      <span>{t('receipts.page', { a: page, b: pages })}</span>
      <Button
        type="button"
        tone="outline"
        small
        fit
        className={SMALL_BUTTON}
        disabled={page >= pages}
        onClick={() => {
          onPage(page + 1);
        }}
      >
        {t('receipts.next')}
      </Button>
    </div>
  );
}
