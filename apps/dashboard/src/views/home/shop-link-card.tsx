import { useTranslation } from 'react-i18next';
import { useMarkLinkShared } from '@/api/home';
import { LinkShare } from '@/components/link-share';
import { Card } from '@/components/ui/card';
import { appConfig } from '@/lib/app-config';
import { useShell } from '@/shell/shell-context';

/**
 * The shop's link (TENANT-DASHBOARD-DESIGN §7.1, the prototype's link card): the address with Copy, and sharing it on
 * Facebook or WhatsApp. Each records that the link went out (SUP-01's tick, kept by the server for every device), and
 * any member may do it (decided 2026-10-23).
 */
export function ShopLinkCard({ id }: { id: string }): React.JSX.Element {
  const { t } = useTranslation('home');
  const { slug } = useShell();
  const shared = useMarkLinkShared();
  const host = appConfig.shopHost(slug);
  return (
    <Card id={id} className="scroll-mt-4">
      <h3 className="mb-1 text-[17px] font-semibold">{t('shopLink')}</h3>
      <LinkShare
        url={appConfig.shopUrl(slug)}
        shown={host}
        onShared={() => {
          shared.mutate();
        }}
      />
    </Card>
  );
}
