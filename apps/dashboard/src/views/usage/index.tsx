import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { IdentityKind, Permission, RateKey } from '@lytronix/validators';
import { formatTakaExact } from '@lytronix/ui';
import { useAddonOffers } from '@/api/addons';
import { useCurrentRates } from '@/api/balance';
import { useIdentities } from '@/api/identities';
import { useUsage } from '@/api/usage';
import { ErrorBanner } from '@/components/error-banner';
import { Banner } from '@/components/ui/banner';
import { Card } from '@/components/ui/card';
import { formatDayMonth, formatShortDay } from '@/lib/dates';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { ShopUsage } from '@/types/usage';
import { AutoBuyCard } from './auto-buy-card';
import { PerUseCard } from './per-use-card';
import { readsOf, readsOffer, readsPercent } from './per-use';
import { BannerLinkTo, DayChart, MetricRow } from './usage-parts';
import {
  bannerOf,
  cycleDays,
  drawnUsage,
  lastDayOf,
  raiseItems,
  type Channels,
} from './usage-words';

/**
 * Usage (TENANT-DASHBOARD-DESIGN §7.24, the prototype's `usage` with Part 10's states): the cycle's dates, the one
 * banner for the metric nearest its stop, every metric against its limit with the run-out date and the ways to more
 * room, the auto-buy switch with what auto-buy did, and requests a day. Media bandwidth is no limit (D9-31).
 */
export function UsageView(): React.JSX.Element {
  const { t, i18n } = useTranslation('money');
  const { viewer, slug } = useShell();
  const canManage = allows(viewer, [Permission.PaymentsManage]);
  const usage = useUsage();
  const offers = useAddonOffers();
  // Only an owner is told by email and SMS; staff see the banner without the channels (LIM-01).
  const identities = useIdentities({ enabled: viewer.isOwner });
  const rates = useCurrentRates({ enabled: allows(viewer, [Permission.BalanceRead]) });

  const data = usage.data ? drawnUsage(usage.data) : undefined;
  const offered = offers.data ?? [];
  const kinds = identities.data?.identities.map((identity) => identity.kind) ?? [];
  const channels: Channels | null = viewer.isOwner
    ? { email: kinds.includes(IdentityKind.Email), phone: kinds.includes(IdentityKind.Phone) }
    : null;
  const smsRate = rates.data?.find((rate) => rate.key === RateKey.SmsPerUnit)?.value;
  const banner = data
    ? bannerOf(data, {
        t,
        language: i18n.language,
        offers: offered,
        canManage,
        channels,
        smsRate: smsRate ? formatTakaExact(smsRate) : null,
      })
    : null;
  // PLN-20 (Part 37's `p37-usage-low`): the reads pack at 90%, said in place of a warning that isn't a stop.
  const reads = readsOf(data);
  const readsAt = reads ? readsPercent(reads) : null;
  const readsLow = reads?.allowance && readsAt !== null && readsAt >= 90 && banner?.tone !== 'bad';
  const readsBuy = readsOffer(offered);

  return (
    <ShellPage>
      {usage.isError ? <ErrorBanner error={usage.error} /> : null}
      {data ? (
        <>
          <p className="num text-[14px] text-fg-muted">
            {t('uCycle', {
              from: formatDayMonth(data.cycleStart),
              to: formatDayMonth(lastDayOf(data)),
            })}
          </p>
          {readsLow && reads.allowance ? (
            <Banner
              tone="warn"
              action={
                canManage && readsBuy ? (
                  <Link
                    to="/$shop/addons"
                    params={{ shop: slug }}
                    search={{ buy: readsBuy.addon.key }}
                    className="text-primary"
                  >
                    {t('p37RdBuy', { n: readsBuy.addon.unitSize ?? 0 })}
                  </Link>
                ) : undefined
              }
            >
              {t('p37UReadsLow', {
                p: readsAt,
                n: reads.allowance.left,
                d: formatShortDay(reads.allowance.endsAt, i18n.language),
                r: formatTakaExact(reads.rate),
              })}
            </Banner>
          ) : banner ? (
            <Banner
              tone={banner.tone}
              action={banner.link ? <BannerLinkTo link={banner.link} /> : undefined}
            >
              {banner.text}
            </Banner>
          ) : null}
          <Card flush>
            {data.metrics.map((figure) => (
              <MetricRow
                key={figure.metric}
                figure={figure}
                raise={raiseItems(data, figure, offered, t, i18n.language)}
              />
            ))}
          </Card>
          {reads ? <PerUseCard reads={reads} offers={offered} /> : null}
          <AutoBuyCard usage={data} canManage={canManage} help="uAutoBuyHelp" />
          <DayCharts usage={data} />
        </>
      ) : null}
    </ShellPage>
  );
}

/** Requests a day (Slice 11.5a.2), the cycle's days so far. */
function DayCharts({ usage }: { usage: ShopUsage }): React.JSX.Element {
  const { t } = useTranslation('money');
  const requests = cycleDays(
    usage,
    usage.requestDays.map((each) => ({ day: each.day, value: each.requests })),
  );
  return (
    <DayChart
      title={t('uRequestsDay')}
      bars={requests}
      first={formatDayMonth(usage.cycleStart)}
      todayFigure={(requests.at(-1)?.value ?? 0).toLocaleString('en-US')}
    />
  );
}
