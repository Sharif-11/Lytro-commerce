import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { usePaymentQueue } from '@/api/payment-queue';
import { ConsolePage, PageTitle, SectionTitle } from '@/components/ui/console-page';
import { LoadFailed } from '@/components/ui/load-failed';
import { QueueFigures } from '@/views/queue/queue-figures';
import { AlsoWaiting } from './also-waiting';
import { PlatformFigures } from './platform-figures';
import { RecentChanges } from './recent-changes';

/** The console's first screen (OPERATOR-CONSOLE-DESIGN §3): what needs a person, then what changed. */
export function Today(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queue = usePaymentQueue();
  return (
    <ConsolePage>
      <PageTitle
        title={t('today.title')}
        lead={t('today.lead')}
        actions={
          <>
            <Button
              type="button"
              tone="outline"
              small
              fit
              className="flex-[1_1_auto] sm:flex-none"
              onClick={() => {
                void navigate({ to: '/shops' });
              }}
            >
              {t('today.findShop')}
            </Button>
            <Button
              type="button"
              small
              fit
              className="flex-[1_1_auto] sm:flex-none"
              onClick={() => {
                void navigate({ to: '/queue' });
              }}
            >
              {t('today.openQueue')}
            </Button>
          </>
        }
      />
      <SectionTitle>{t('today.needsYou')}</SectionTitle>
      {queue.isError ? (
        <LoadFailed
          onRetry={() => {
            void queue.refetch();
          }}
        />
      ) : (
        <>
          <QueueFigures payments={queue.data} />
          <SectionTitle>{t('today.more')}</SectionTitle>
          <AlsoWaiting />
        </>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <RecentChanges />
        <PlatformFigures />
      </div>
    </ConsolePage>
  );
}
