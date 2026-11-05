import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { Banner } from './banner';

/** A read that failed: says nothing was changed, and offers the retry (OPERATOR-CONSOLE-DESIGN §1). */
export function LoadFailed({ onRetry }: { onRetry: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Banner tone="bad" icon="warn">
      <b className="font-semibold">{t('common.loadFailedTitle')}</b>
      <div>{t('common.loadFailedBody')}</div>
      <div className="mt-2">
        <Button
          type="button"
          tone="outline"
          small
          fit
          className="min-h-8! px-2.5! text-[13px]!"
          onClick={onRetry}
        >
          {t('common.retry')}
        </Button>
      </div>
    </Banner>
  );
}
