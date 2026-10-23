import { useTranslation } from 'react-i18next';
import { useMarkLinkShared } from '@/api/home';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
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
  const { copied, copy } = useCopyToClipboard();
  const host = appConfig.shopHost(slug);
  const url = `https://${host}`;
  const record = (): void => {
    shared.mutate();
  };
  const share = (name: string, href: string): React.JSX.Element => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={record}
      className={`${buttonClass('outline', 'sm')} no-underline`}
    >
      <Icon name="share" />
      {name}
    </a>
  );

  return (
    <Card id={id} className="scroll-mt-4">
      <h3 className="mb-1 text-[17px] font-semibold">{t('shopLink')}</h3>
      <div className="mt-2 mb-3 flex h-12 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-[16px]">
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
          {host}
        </span>
        <Button
          tone="outline"
          size="xs"
          onClick={() => {
            void copy(url).then((ok) => {
              if (ok) record();
            });
          }}
        >
          {copied ? t('copied') : t('copy')}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {share(
          t('facebook'),
          `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
        )}
        {share(t('whatsapp'), `https://wa.me/?text=${encodeURIComponent(url)}`)}
      </div>
    </Card>
  );
}
