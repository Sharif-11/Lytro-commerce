import { useTranslation } from 'react-i18next';
import { useMarkLinkShared } from '@/api/home';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { useShopAddress } from '@/hooks/use-shop-address';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';

/**
 * TENANT-DASHBOARD-DESIGN §7.2, the prototype's `orders-soon`: the Orders tab until Phase 4 -- what will appear here,
 * and the one thing worth doing meanwhile, sharing the shop's link (which ticks SUP-01's checklist item).
 */
export function OrdersSoon(): React.JSX.Element {
  const { t } = useTranslation('shell');
  const { showToast } = useShell();
  const shared = useMarkLinkShared();
  const { url } = useShopAddress();

  const share = async (): Promise<void> => {
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ url });
      } else {
        await navigator.clipboard.writeText(url);
        showToast(t('copied'));
      }
      shared.mutate();
    } catch {
      // The person closed the share sheet, or the clipboard is blocked: nothing was shared.
    }
  };

  return (
    <ShellPage>
      <Card>
        <EmptyState
          icon="orders"
          action={
            <Button
              tone="outline"
              size="sm"
              onClick={() => {
                void share();
              }}
            >
              {t('shareLink')}
            </Button>
          }
        >
          <b>{t('ordersSoonT')}</b>
          <br />
          {t('ordersSoonL')}
        </EmptyState>
      </Card>
    </ShellPage>
  );
}
