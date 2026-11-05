import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { PAGE_REPORTS_QUERY_KEY } from '@/api/page-reports';
import { useSuspendPage } from '@/api/shops';
import { ActionPanel } from '@/components/ui/action-panel';
import { Consequence } from '@/components/ui/consequence';
import { ReasonField } from '@/components/ui/reason-field';
import { useToast } from '@/components/ui/use-toast';

/** TVR-03: the payment page alone. Shared by the shop's page and the page reports, whose open ones it marks acted on. */
export function SuspendPagePanel({
  shop,
  onClose,
  onCancel,
}: {
  shop: { id: string; name: string; slug: string };
  onClose: () => void;
  onCancel?: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const suspend = useSuspendPage();
  const [reason, setReason] = useState('');
  return (
    <ActionPanel
      title={t('shop.pageSuspendTitle', { shop: shop.name })}
      sub={`${shop.slug}.lytro.app`}
      onClose={onClose}
      onCancel={onCancel}
      actionLabel={t('shop.pageSuspend')}
      danger
      pending={suspend.isPending}
      canSubmit={reason.trim() !== ''}
      error={suspend.isError ? errorMessage(suspend.error, t) : null}
      onSubmit={() => {
        suspend.mutate(
          { shopId: shop.id, reason: reason.trim() },
          {
            onSuccess: () => {
              void queryClient.invalidateQueries({ queryKey: PAGE_REPORTS_QUERY_KEY });
              toast(t('shop.pageSuspended', { shop: shop.name }));
              onClose();
            },
          },
        );
      }}
    >
      <Consequence tone="danger">{t('shop.pageSuspendConsequence')}</Consequence>
      <ReasonField value={reason} onChange={setReason} />
    </ActionPanel>
  );
}
