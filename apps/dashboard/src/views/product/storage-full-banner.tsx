import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission, UsageMetric } from '@lytronix/validators';
import { useAddonOffers } from '@/api/addons';
import { useUsage } from '@/api/usage';
import { Banner } from '@/components/ui/banner';
import { megabytes, usageSize } from '@/lib/limits';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import type { StorageUsage } from '@/types/media';
import { raiseItems } from '@/views/usage/usage-words';

/**
 * STO-03 (the prototype's `sh-media-full`): an upload refused because storage is full -- how full, that the upload was
 * refused, and the ways out: for someone who may pay, deleting old photos and Usage's ways to more room, with Buy and
 * the add-on's size (the server's suggestion); for anyone else, deleting old photos or asking the owner.
 */
export function StorageFullBanner({ storage }: { storage: StorageUsage }): React.JSX.Element {
  const { t, i18n } = useTranslation('shop');
  const { t: money } = useTranslation('money');
  const { slug, viewer } = useShell();
  const canPay =
    allows(viewer, [Permission.PaymentsManage]) && allows(viewer, [Permission.PaymentsRead]);
  const usage = useUsage({ enabled: canPay });
  const offers = useAddonOffers({ enabled: canPay });
  const figure = usage.data?.metrics.find((each) => each.metric === UsageMetric.Storage);
  const items =
    usage.data && figure
      ? raiseItems(usage.data, figure, offers.data ?? [], money, i18n.language)
      : [];
  const addon = items.find((item) => item.kind === 'addon');
  const unit = offers.data?.find((offer) => offer.addon.key === addon?.key)?.addon.unitSize;
  const full = t('upFull', {
    used: usageSize(storage.usedBytes, storage.limitBytes),
    limit: usageSize(storage.limitBytes ?? storage.usedBytes, storage.limitBytes),
  });
  return (
    <Banner
      tone="bad"
      action={
        canPay && addon && 'key' in addon && unit ? (
          <Link to="/$shop/addons" params={{ shop: slug }} search={{ buy: addon.key }}>
            {t('buyStorage', { size: megabytes(unit) })}
          </Link>
        ) : undefined
      }
    >
      {full}{' '}
      {canPay
        ? `${t('upFullDelete')} ${items.length > 0 ? money('uSuggest', { items: items.map((item) => item.text).join(' · ') }) : ''}`
        : t('upFullOwner')}
    </Banner>
  );
}
