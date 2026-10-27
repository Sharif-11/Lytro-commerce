import { useTranslation } from 'react-i18next';
import { IdentityKind, Permission, RateKey, UsageMetric } from '@lytronix/validators';
import { formatTakaExact } from '@lytronix/ui';
import { useAddonOffers } from '@/api/addons';
import { useCurrentRates } from '@/api/balance';
import { useIdentities } from '@/api/identities';
import { useUsage } from '@/api/usage';
import { Banner } from '@/components/ui/banner';
import { Card } from '@/components/ui/card';
import { useErrorText } from '@/hooks/use-error-text';
import { formatDayMonth } from '@/lib/dates';
import { usageSize } from '@/lib/limits';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { ShopUsage } from '@/types/usage';
import { AutoBuyCard } from './auto-buy-card';
import { BannerLinkTo, DayChart, MetricRow } from './usage-parts';
import { bannerOf, cycleDays, lastDayOf, raiseItems, type Channels } from './usage-words';

/**
 * Usage (TENANT-DASHBOARD-DESIGN §7.24, the prototype's `usage` with Part 10's states): the cycle's dates, the one
 * banner for the metric nearest its stop, every metric against its limit with the run-out date and the ways to more
 * room, the two auto-buy switches with what auto-buy did, and bandwidth and requests a day.
 */
export function UsageView(): React.JSX.Element {
  const { t, i18n } = useTranslation('money');
  const errorText = useErrorText();
  const { viewer } = useShell();
  const canManage = allows(viewer, [Permission.PaymentsManage]);
  const usage = useUsage();
  const offers = useAddonOffers();
  // Only an owner is told by email and SMS; staff see the banner without the channels (LIM-01).
  const identities = useIdentities({ enabled: viewer.isOwner });
  const rates = useCurrentRates({ enabled: allows(viewer, [Permission.BalanceRead]) });

  const data = usage.data;
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

  return (
    <ShellPage>
      {usage.isError ? <Banner tone="bad">{errorText(usage.error)}</Banner> : null}
      {data ? (
        <>
          <p className="num text-[14px] text-fg-muted">
            {t('uCycle', {
              from: formatDayMonth(data.cycleStart),
              to: formatDayMonth(lastDayOf(data)),
            })}
          </p>
          {banner ? (
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
          <AutoBuyCard usage={data} canManage={canManage} help="uAutoBuyHelp" />
          <DayCharts usage={data} />
        </>
      ) : null}
    </ShellPage>
  );
}

/** BND-08: bandwidth and requests a day, side by side from 1024 px, 16 px apart below it. */
function DayCharts({ usage }: { usage: ShopUsage }): React.JSX.Element {
  const { t } = useTranslation('money');
  const bandwidth = cycleDays(
    usage,
    usage.bandwidthDays.map((each) => ({ day: each.day, value: each.bytes })),
  );
  const requests = cycleDays(
    usage,
    usage.requestDays.map((each) => ({ day: each.day, value: each.requests })),
  );
  const first = formatDayMonth(usage.cycleStart);
  const allowance = usage.metrics.find((figure) => figure.metric === UsageMetric.Bandwidth)?.limit;
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-6">
      <DayChart
        title={t('uBandwidthDay')}
        bars={bandwidth}
        first={first}
        todayFigure={usageSize(bandwidth.at(-1)?.value ?? 0, allowance ?? null)}
      />
      <DayChart
        title={t('uRequestsDay')}
        bars={requests}
        first={first}
        todayFigure={(requests.at(-1)?.value ?? 0).toLocaleString('en-US')}
      />
    </div>
  );
}
