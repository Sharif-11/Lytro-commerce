import { useTranslation } from 'react-i18next';
import { useShopSettings } from '@/api/shop-settings';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { CopyButton } from '@/components/ui/copy-button';
import { useShopAddress } from '@/hooks/use-shop-address';
import { bangladeshiPhone } from '@/lib/phone';
import { useShell } from '@/shell/shell-context';
import type { Order } from '@/types/orders';

/**
 * The customer's tracking ID, for the seller (the owner, 2026-11-19, the sketch's `tk-order`): customers track an order
 * by its tracking ID alone, publicly, so the seller sees it, copies it and sends it. Share opens the phone's own share
 * menu, or copies the link where there is none; WhatsApp opens a chat with the customer, the message written. Shown
 * while the storefront is on, as the tracking page is the storefront's.
 */
export function TrackingCard({ order }: { order: Order }): React.JSX.Element | null {
  const { t } = useTranslation('orders');
  const { showToast } = useShell();
  const settings = useShopSettings();
  const { url: shop, host } = useShopAddress();
  if (settings.data?.storefrontEnabled === false) return null;
  const link = `${shop}/track/${encodeURIComponent(order.trackingId)}`;
  const shown = `${host}/track/${order.trackingId}`;
  const message = t('tkMessage', { order: order.orderNumber, url: link });
  const phone = order.customerPhone ? bangladeshiPhone.forWhatsapp(order.customerPhone) : null;

  const share = (): void => {
    if (typeof navigator.share === 'function') {
      navigator.share({ text: message, url: link }).catch(() => undefined);
      return;
    }
    void navigator.clipboard.writeText(link).then(() => {
      showToast(t('tkLinkCopied'));
    });
  };

  return (
    <Card>
      <h2 className="text-[17px] font-semibold">{t('tkTitle')}</h2>
      <div className="mt-2.5 text-[14px] text-fg-muted">{t('tkId')}</div>
      <div className="mt-1 flex flex-wrap items-center gap-2.5">
        <b className="rounded-[8px] bg-neutral-100 px-2.5 py-1 font-mono text-[18px] font-bold tracking-[0.08em]">
          {order.trackingId}
        </b>
        <CopyButton text={order.trackingId} icon />
      </div>
      <a
        href={link}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-[14px] font-semibold [overflow-wrap:anywhere] text-primary"
      >
        {shown} <Icon name="external" size={14} />
      </a>
      <p className="mt-1.5 mb-2.5 text-[14px] text-fg-muted">{t('tkHint')}</p>
      <div className="flex flex-wrap gap-2">
        <Button tone="outline" size="sm" onClick={share}>
          <Icon name="share" size={16} /> {t('tkShare')}
        </Button>
        {phone ? (
          <a
            href={`https://wa.me/${phone}?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noreferrer"
            className={buttonClass('outline', 'sm')}
          >
            <Icon name="message" size={16} /> {t('tkWhatsapp')}
          </a>
        ) : null}
      </div>
      {phone ? (
        <p className="mt-2.5 text-[13px] leading-[1.5] text-fg-muted">
          {t('tkWhatsappGets', { m: message })}
        </p>
      ) : null}
    </Card>
  );
}
