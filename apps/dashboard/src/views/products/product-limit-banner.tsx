import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission, TenantState, UsageMetric } from '@lytronix/validators';
import { useAddonOffers } from '@/api/addons';
import type { ProductRoom } from '@/api/catalogue';
import { useUsage } from '@/api/usage';
import { Banner } from '@/components/ui/banner';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { raiseItems } from '@/views/usage/usage-words';

/**
 * PRD-04, LIM-01 (Part 13's `products-limit-now`): the product limit, said before a product is typed -- how many there
 * are and that they keep selling; to someone who may pay, the ways to more room as Usage words them from the server's
 * suggestion, with See plans; to anyone else, that the owner can raise it. `refused` is a save the limit refused after
 * all, in the words the prototype's `products-limit` has for it ("the new one was not added").
 */
export function ProductLimitBanner({
  room,
  lead = 'now',
}: {
  room: ProductRoom;
  lead?: 'now' | 'refused';
}): React.JSX.Element {
  const { t, i18n } = useTranslation('shop');
  const { t: money } = useTranslation('money');
  const { slug, viewer, tenant } = useShell();
  const canPay =
    allows(viewer, [Permission.PaymentsManage]) && allows(viewer, [Permission.PaymentsRead]);
  const usage = useUsage({ enabled: canPay });
  const offers = useAddonOffers({ enabled: canPay });
  const figure = usage.data?.metrics.find((each) => each.metric === UsageMetric.Products);
  const items =
    usage.data && figure
      ? raiseItems(usage.data, figure, offers.data ?? [], money, i18n.language)
      : [];
  const title = t(tenant.state === TenantState.Trial ? 'lrTitleTrial' : 'lrTitle', {
    limit: room.limit ?? room.used,
  });
  const ways = canPay
    ? items.length > 0
      ? money('uSuggest', { items: items.map((item) => item.text).join(' · ') })
      : ''
    : t('lrOwner');
  return (
    <Banner
      tone="bad"
      action={
        canPay ? (
          <Link to="/$shop/plan" params={{ shop: slug }}>
            {t('lrUpgrade')}
          </Link>
        ) : undefined
      }
    >
      <b>{title}</b> {t(lead === 'now' ? 'lrNowLead' : 'lrRefusedLead', { used: room.used })} {ways}
    </Banner>
  );
}
