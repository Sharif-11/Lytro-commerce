import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  AddonKind,
  AddonRenewal,
  Permission,
  TenantState,
  UsageMetric,
} from '@lytronix/validators';
import { formatTaka, formatTakaExact } from '@lytronix/ui';
import { useAddonOffers, useSetAddonRenewal, useShopAddons } from '@/api/addons';
import { useBalance } from '@/api/balance';
import { useBillingPrices } from '@/api/billing';
import { useUsage } from '@/api/usage';
import { Banner } from '@/components/ui/banner';
import { Card } from '@/components/ui/card';
import { useErrorText } from '@/hooks/use-error-text';
import { formatDayMonth } from '@/lib/dates';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import { usePaymentNotices } from '@/views/billing/notices';
import { PaymentBanner } from '@/views/billing/payment-banner';
import { AutoBuyCard } from '@/views/usage/auto-buy-card';
import { AddonRow, type RowContext } from './addon-row';
import {
  endingBanner,
  groupsOf,
  headLine,
  nameOf,
  packMetric,
  type AddonLine,
} from './addon-words';
import { BuySheet } from './buy-sheet';
import { PackSheet } from './pack-sheet';

const DAY_MS = 24 * 60 * 60 * 1000;

type OpenSheet =
  { kind: 'buy'; addonId: string } | { kind: 'pack'; metric: 'bandwidth' | 'requests' };

/**
 * Add-ons (TENANT-DASHBOARD-DESIGN §7.25, the prototype's `addons` with Part 10's states): what the shop has renews
 * with the plan for how much, or on pay-as-you-go from the balance -- or in its place the banner that needs the seller,
 * a balance too short to renew one below it; Raise a limit, Packs and Features, each with its price and one action;
 * auto-buy. `?buy=<key>` and `?pack=<metric>` open the sheets.
 */
export function AddonsView({
  buy,
  pack,
}: {
  buy: string | null;
  pack: 'bandwidth' | 'requests' | null;
}): React.JSX.Element {
  const { t, i18n } = useTranslation('money');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { tenant, viewer, slug, showToast } = useShell();
  const canManage = allows(viewer, [Permission.PaymentsManage]);
  const offers = useAddonOffers();
  const mine = useShopAddons();
  const usage = useUsage();
  const prices = useBillingPrices(tenant.billingTerm?.id ?? null);
  const balance = useBalance({ enabled: allows(viewer, [Permission.BalanceRead]) });
  const notices = usePaymentNotices();
  const setRenewal = useSetAddonRenewal();
  const [sheet, setSheet] = useState<OpenSheet | null>(null);

  const trial = tenant.state === TenantState.Trial;
  const grace = tenant.state === TenantState.Grace;
  const payg = tenant.state === TenantState.PayAsYouGo;
  const offered = offers.data ?? [];
  const owned = mine.data?.addons ?? [];
  const groups = groupsOf(offered, owned);
  const renewal = prices.data?.find((option) => option.move === 'renewal');
  const context: RowContext = {
    trial,
    grace,
    canManage,
    planName: tenant.planName ?? '',
    packs: mine.data?.packs ?? [],
    figures: usage.data?.metrics ?? [],
    checkingKey:
      notices.addon?.state === 'checking' ? (notices.addon.payment.addons[0]?.key ?? null) : null,
  };

  // Usage's links name an add-on or a pack: its sheet opens once the prices are read, and the link's mark is dropped.
  const asked = buy ? offered.find((offer) => offer.addon.key === buy) : undefined;
  const askedReady = pack !== null && offered.length > 0;
  useEffect(() => {
    if (!asked && !askedReady) return;
    if (canManage && asked && asked.blockedBy === null) {
      setSheet(
        asked.addon.kind === AddonKind.Pack
          ? {
              kind: 'pack',
              metric: packMetric(asked.addon) === UsageMetric.Requests ? 'requests' : 'bandwidth',
            }
          : { kind: 'buy', addonId: asked.addon.id },
      );
    }
    if (canManage && askedReady) setSheet({ kind: 'pack', metric: pack });
    void navigate({ to: '/$shop/addons', params: { shop: slug }, search: {}, replace: true });
  }, [asked, askedReady, pack, canManage, navigate, slug]);

  function open(line: AddonLine): void {
    if (line.addon.kind === AddonKind.Pack) {
      setSheet({
        kind: 'pack',
        metric: packMetric(line.addon) === UsageMetric.Requests ? 'requests' : 'bandwidth',
      });
      return;
    }
    setSheet({ kind: 'buy', addonId: line.addon.id });
  }

  function finish(message: string): void {
    setSheet(null);
    showToast(message);
  }

  const ending = endingBanner(owned, usage.data?.metrics ?? [], t, i18n.language);
  const short = owned.find((each) => each.renewal === AddonRenewal.BalanceShort);
  const shortOffer = short ? offered.find((offer) => offer.addon.id === short.addonId) : undefined;
  const graceEnd =
    tenant.periodEnd && tenant.lapseStages
      ? new Date(
          new Date(tenant.periodEnd).getTime() + tenant.lapseStages.grace * DAY_MS,
        ).toISOString()
      : null;
  const buying =
    sheet?.kind === 'buy' ? offered.find((offer) => offer.addon.id === sheet.addonId) : undefined;
  const packs = offered.filter((offer) => offer.addon.kind === AddonKind.Pack);

  return (
    <ShellPage>
      {offers.isError || mine.isError ? (
        <Banner tone="bad">{errorText(offers.error ?? mine.error)}</Banner>
      ) : null}
      {trial ? <Banner tone="neutral">{t('aoTrialBanner')}</Banner> : null}
      {grace && tenant.periodEnd && graceEnd ? (
        <Banner
          tone="warn"
          action={
            renewal?.amount ? (
              <Link to="/$shop/plan" params={{ shop: slug }} className="text-primary">
                {t('renewFor', { amount: formatTaka(renewal.amount) })}
              </Link>
            ) : undefined
          }
        >
          {t('aoGraceBanner', {
            date: formatDayMonth(tenant.periodEnd),
            end: formatDayMonth(graceEnd),
          })}
        </Banner>
      ) : null}
      {notices.addon ? <PaymentBanner notice={notices.addon} about="addon" /> : null}
      {ending ? (
        <Banner
          tone="warn"
          action={
            canManage ? (
              <button
                type="button"
                className="font-semibold text-primary"
                onClick={() => {
                  setRenewal.mutate({ id: ending.addon.id, renews: true });
                }}
              >
                {t('alKeep')}
              </button>
            ) : undefined
          }
        >
          {ending.text}
        </Banner>
      ) : null}
      {trial || grace || notices.addon || ending ? null : (
        <p className="num text-[14px] text-fg-muted">
          {headLine(
            { payg, owned, renewing: renewal?.addons ?? [], periodEnd: tenant.periodEnd },
            t,
          )}
        </p>
      )}
      {short && shortOffer?.renewalPrice != null && balance.data ? (
        <Banner
          tone="warn"
          action={
            canManage ? (
              <Link
                to="/$shop/balance"
                params={{ shop: slug }}
                search={{ topup: 1 }}
                className="text-primary"
              >
                {t('topUp')}
              </Link>
            ) : undefined
          }
        >
          {t('aoShortBanner', {
            name: nameOf(short, i18n.language),
            date: formatDayMonth(short.expiresAt),
            amount: formatTaka(shortOffer.renewalPrice * short.quantity),
            balance: formatTakaExact(balance.data.amount),
          })}
        </Banner>
      ) : null}
      {groups.length > 0 ? (
        <Card flush>
          {groups.map((group) => (
            <div key={group.kind} className="border-line [&+&]:mt-1 [&+&]:border-t">
              <div className="px-4 pt-3 pb-1 text-[12px] font-bold tracking-[0.04em] text-neutral-700 uppercase">
                {t(group.title)}
              </div>
              {group.lines.map((line) => (
                <AddonRow key={line.addon.id} line={line} context={context} onBuy={open} />
              ))}
            </div>
          ))}
        </Card>
      ) : null}
      {!trial && usage.data ? (
        <AutoBuyCard usage={usage.data} canManage={canManage} help="pkCap" />
      ) : null}
      {sheet?.kind === 'buy' && buying ? (
        <BuySheet
          offer={buying}
          figures={usage.data?.metrics ?? []}
          payg={payg}
          onClose={() => {
            setSheet(null);
          }}
          onDone={finish}
        />
      ) : null}
      {sheet?.kind === 'pack' && packs.length > 0 ? (
        <PackSheet
          packs={packs}
          metric={sheet.metric}
          usage={usage.data}
          canManage={canManage}
          onClose={() => {
            setSheet(null);
          }}
          onDone={finish}
        />
      ) : null}
    </ShellPage>
  );
}
