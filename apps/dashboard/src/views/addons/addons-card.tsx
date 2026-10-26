import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AddonKind, Permission, TenantState, UsageMetric } from '@lytronix/validators';
import { useAddonOffers, useShopAddons } from '@/api/addons';
import { useBillingPrices } from '@/api/billing';
import { useUsage } from '@/api/usage';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { AddonRow, type RowContext } from './addon-row';
import { groupsOf, headLine, packMetric, type AddonLine } from './addon-words';

/**
 * The add-ons card on Plan and on the pay-as-you-go page (TENANT-DASHBOARD-DESIGN §7.12, the prototype's Plan and
 * `plan-payg`): what the shop has, how it renews and for how much, the packs left, and the way to all of them. A trial
 * is told it buys none yet.
 */
export function AddonsCard(): React.JSX.Element {
  const { t } = useTranslation('money');
  const navigate = useNavigate();
  const { tenant, viewer, slug } = useShell();
  const offers = useAddonOffers();
  const mine = useShopAddons();
  const usage = useUsage();
  const prices = useBillingPrices(tenant.billingTerm?.id ?? null);
  const trial = tenant.state === TenantState.Trial;
  const payg = tenant.state === TenantState.PayAsYouGo;
  const owned = mine.data?.addons ?? [];
  const packs = mine.data?.packs ?? [];
  const lines = groupsOf(offers.data ?? [], owned)
    .flatMap((group) => group.lines)
    .filter((line) => {
      if (line.owned) return true;
      const metric = packMetric(line.addon);
      return metric !== null && (packs.find((each) => each.metric === metric)?.left ?? 0) > 0;
    });
  const context: RowContext = {
    trial: false,
    grace: tenant.state === TenantState.Grace,
    canManage: allows(viewer, [Permission.PaymentsManage]),
    planName: tenant.planName ?? '',
    packs,
    figures: usage.data?.metrics ?? [],
    checkingKey: null,
  };
  const renewing = prices.data?.find((option) => option.move === 'renewal')?.addons ?? [];

  function open(line: AddonLine): void {
    const metric = packMetric(line.addon);
    void navigate({
      to: '/$shop/addons',
      params: { shop: slug },
      search:
        line.addon.kind === AddonKind.Pack
          ? { pack: metric === UsageMetric.Requests ? 'requests' : 'bandwidth' }
          : { buy: line.addon.key },
    });
  }

  const rows = lines.map((line) => (
    <AddonRow key={line.addon.id} line={line} context={context} onBuy={open} />
  ));

  if (payg) {
    return (
      <Card>
        <h3 className="mb-1 text-[17px] font-semibold">{t('addons')}</h3>
        <p className="mt-1 text-[14px] text-fg-muted">{t('pyAddons')}</p>
        {rows.length > 0 ? <div className="mt-2">{rows}</div> : null}
        <Link
          to="/$shop/addons"
          params={{ shop: slug }}
          className={`mt-3 ${buttonClass('outline', 'sm')}`}
        >
          {t('addons')}
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="mb-1 text-[17px] font-semibold">{t('addons')}</h3>
        <Link
          to="/$shop/addons"
          params={{ shop: slug }}
          className="text-[14px] font-medium whitespace-nowrap text-primary no-underline"
        >
          {t('aoSeeAll')}
        </Link>
      </div>
      <p className="num mt-1 text-[14px] text-fg-muted">
        {trial
          ? t('aoTrialBanner')
          : headLine({ payg: false, owned, renewing, periodEnd: tenant.periodEnd }, t)}
      </p>
      {!trial && rows.length > 0 ? <div className="-mx-4 mt-2 -mb-4">{rows}</div> : null}
    </Card>
  );
}
