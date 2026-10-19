import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { appConfig } from '@/lib/app-config';

/** The shop link with Copy, Facebook and WhatsApp (ONBOARDING-FLOW-DESIGN §3); any of them ticks the
    checklist's "share the shop link" item. */
export function ShopLinkCard({
  slug,
  onShared,
}: {
  slug: string;
  onShared: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const { copied, copy } = useCopyToClipboard();
  const url = `https://${appConfig.shopHost(slug)}`;
  const message = t('home.link.shareText', { url });

  return (
    <section className="rounded-card border border-line bg-white p-4 shadow-card sm:p-5">
      <h2 className="text-[16px] font-bold text-ink">{t('home.link.title')}</h2>
      <p className="num mt-2 rounded-control bg-neutral-50 px-3.5 py-3 text-[15px] font-semibold break-all text-ink select-all">
        {appConfig.shopHost(slug)}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Button
          type="button"
          tone="outline"
          onClick={() => {
            void copy(url).then((ok) => {
              if (ok) onShared();
            });
          }}
        >
          <Icon name={copied ? 'check' : 'copy'} size={18} />
          {copied ? t('common.copied') : t('common.copy')}
        </Button>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noreferrer"
          onClick={onShared}
          className="block"
        >
          <Button type="button" tone="outline">
            <Icon name="facebook" size={18} />
            {t('home.link.facebook')}
          </Button>
        </a>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noreferrer"
          onClick={onShared}
          className="block"
        >
          <Button type="button" tone="outline">
            <Icon name="sms" size={18} />
            {t('home.link.whatsapp')}
          </Button>
        </a>
      </div>
    </section>
  );
}
