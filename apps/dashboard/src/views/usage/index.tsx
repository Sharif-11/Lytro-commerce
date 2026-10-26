import { useTranslation } from 'react-i18next';
import {
  IdentityKind,
  PACK_AUTO_BUY_CAP,
  Permission,
  RateKey,
  UsageMetric,
} from '@lytronix/validators';
import { formatTakaExact } from '@lytronix/ui';
import { useAddonOffers, useSetAutoBuy } from '@/api/addons';
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
import { BannerLinkTo, DayChart, MetricRow, SwitchNote, SwitchRow } from './usage-parts';
import {
  bannerOf,
  cycleDays,
  lastDayOf,
  packOffer,
  packSize,
  raiseItems,
  type Channels,
  type PackMetric,
} from './usage-words';

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
          <AutoBuyCard usage={data} canManage={canManage} />
          <DayCharts usage={data} />
        </>
      ) : null}
    </ShellPage>
  );
}

/**
 * PLN-15, BND-04, RTE-11 (agreed for Slice 11.5c): a switch for each metric with packs, as the server keeps them, each
 * naming its pack, with what auto-buy did this cycle under it. Shown while the shop can buy packs.
 */
function AutoBuyCard({
  usage,
  canManage,
}: {
  usage: ShopUsage;
  canManage: boolean;
}): React.JSX.Element | null {
  const { t } = useTranslation('money');
  const errorText = useErrorText();
  const offers = useAddonOffers();
  const setAutoBuy = useSetAutoBuy();
  const rows = usage.packs.filter((pack) => pack.offer !== null);
  if (rows.length === 0) return null;
  const words: Record<PackMetric, string> = {
    [UsageMetric.Bandwidth]: 'pkAutoBw',
    [UsageMetric.Requests]: 'pkAutoReq',
  };
  return (
    <Card className="flex flex-col gap-1">
      <h3 className="mb-1 text-[17px] font-semibold">{t('pkAuto')}</h3>
      {rows.map((pack) => {
        const offer = packOffer(offers.data ?? [], pack.metric);
        const label = t(words[pack.metric], { size: offer ? packSize(offer.addon) : '' });
        return (
          <div key={pack.metric}>
            <SwitchRow
              label={label}
              checked={pack.autoBuy}
              disabled={!canManage || setAutoBuy.isPending}
              onChange={(next) => {
                setAutoBuy.mutate(
                  pack.metric === UsageMetric.Bandwidth ? { bandwidth: next } : { requests: next },
                );
              }}
            />
            {pack.autoBuy && pack.autoBuyFailed ? (
              <SwitchNote bad>{t('uAbFailedShort')}</SwitchNote>
            ) : pack.autoBuy && pack.autoPacks >= PACK_AUTO_BUY_CAP ? (
              <SwitchNote bad={false}>
                {t('uAbCapped', { cap: PACK_AUTO_BUY_CAP, date: formatDayMonth(usage.cycleEnd) })}
              </SwitchNote>
            ) : null}
          </div>
        );
      })}
      {setAutoBuy.isError ? <Banner tone="bad">{errorText(setAutoBuy.error)}</Banner> : null}
      <p className="text-[14px] text-fg-muted">{t('uAutoBuyHelp')}</p>
    </Card>
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
