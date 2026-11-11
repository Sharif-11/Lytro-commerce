import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaCosts } from '@/api/media-costs';
import { Banner } from '@/components/ui/banner';
import { ConsoleCard, ConsolePage, PageTitle, SectionTitle } from '@/components/ui/console-page';
import { DataTable, type Column } from '@/components/ui/data-table';
import { figureBox } from '@/components/ui/figure-box';
import { LoadFailed } from '@/components/ui/load-failed';
import { NOTE } from '@/components/ui/sizes';
import { formatDay, useAgo } from '@/lib/format';
import { formatSessionTime } from '@/lib/session-time';
import { usd } from '@/lib/usd';
import type { MediaCosts as MediaCostsView } from '@/types/records';
import { bytesWords, countWords, millions } from '@/views/records/numbers';
import {
  CardHead,
  CardMoney,
  Filters,
  Kvs,
  KvsRow,
  Meter,
  Pick,
  PickSelect,
  RecordFigure,
  RecordFigures,
} from '@/views/records/parts';

type Bucket = MediaCostsView['r2']['buckets'][number];
type TopShop = MediaCostsView['topShops'][number] & { rank: number };

const dollars = (value: string | number): string => usd(Number(value));

/** A bucket's own words: the shops' media, the payment screenshots, or the account's own operations. */
function bucketWord(bucket: string): string {
  if (bucket === '') return 'mediaCosts.account';
  if (bucket.includes('evidence')) return 'mediaCosts.evidenceBucket';
  return 'mediaCosts.mediaBucket';
}

/**
 * OPERATOR-CONSOLE-DESIGN §10g, MED-12, D8-57 to D8-64 (Slice 8.6's route): what Cloudflare will bill Lytro for media this
 * period, held against the budget, in US dollars as Cloudflare bills: R2 by operation and storage, the media Worker, each
 * bucket, and the shops with the most requests. The budget, its alert and the prices are changed in Settings.
 */
export function MediaCosts(): React.JSX.Element {
  const { t } = useTranslation();
  const ago = useAgo();
  const [period, setPeriod] = useState<string | undefined>(undefined);
  const costs = useMediaCosts(period);
  const data = costs.data;

  const head = (
    <>
      <PageTitle title={t('nav.mediaCosts')} lead={t('mediaCosts.lead')} />
      <Filters>
        <Pick label={t('mediaCosts.period')} wide>
          <PickSelect
            value={period ?? data?.period.dateFrom ?? ''}
            disabled={!data}
            onChange={(event) => {
              setPeriod(event.target.value);
            }}
          >
            {(data?.periods ?? []).map((each, index) => (
              <option key={each.dateFrom} value={each.dateFrom}>
                {`${formatDay(`${each.dateFrom}T12:00:00+06:00`)} – ${formatDay(`${each.dateTo}T12:00:00+06:00`)}`}
                {index === 0 ? ` · ${t('mediaCosts.running')}` : ''}
              </option>
            ))}
          </PickSelect>
        </Pick>
      </Filters>
    </>
  );

  if (costs.isError) {
    return (
      <ConsolePage>
        {head}
        <LoadFailed
          onRetry={() => {
            void costs.refetch();
          }}
        />
      </ConsolePage>
    );
  }
  if (!data) return <ConsolePage>{head}</ConsolePage>;

  const { budget, r2, workers, prices } = data;
  const over = budget.usedPercent >= budget.alertPercent;
  const line = (used: string, free: string, billable: number) =>
    t('mediaCosts.line', { u: used, f: free, b: billable });

  const bucketColumns: Column<Bucket>[] = [
    {
      key: 'b',
      label: t('mediaCosts.bucket'),
      width: 'minmax(140px,1.4fr)',
      main: true,
      cell: (bucket) => (
        <>
          <div>{t(bucketWord(bucket.bucket))}</div>
          {bucket.bucket ? (
            <div className="mono text-[12px] font-normal [overflow-wrap:anywhere] text-neutral-700">
              {bucket.bucket}
            </div>
          ) : null}
        </>
      ),
    },
    {
      key: 'a',
      label: t('mediaCosts.classAShort'),
      width: '84px',
      right: true,
      cell: (bucket) => <span className="tabular-nums">{countWords(bucket.classA)}</span>,
    },
    {
      key: 'r',
      label: t('mediaCosts.classBShort'),
      width: '84px',
      right: true,
      cell: (bucket) => <span className="tabular-nums">{countWords(bucket.classB)}</span>,
    },
    {
      key: 'g',
      label: t('mediaCosts.gbMonthsShort'),
      width: '80px',
      right: true,
      cell: (bucket) => (
        <span className="tabular-nums">{bucket.bucket ? String(bucket.gbMonths) : '—'}</span>
      ),
    },
    {
      key: 's',
      label: t('mediaCosts.size'),
      width: '80px',
      right: true,
      cell: (bucket) => (
        <span className="tabular-nums">
          {bucket.latestBytes ? bytesWords(bucket.latestBytes) : '—'}
        </span>
      ),
    },
    {
      key: 'o',
      label: t('mediaCosts.objects'),
      width: '80px',
      right: true,
      cell: (bucket) => (
        <span className="tabular-nums">{bucket.objects ? countWords(bucket.objects) : '—'}</span>
      ),
    },
  ];

  const shopColumns: Column<TopShop>[] = [
    {
      key: 'n',
      label: '#',
      width: '36px',
      cell: (shop) => <span className="text-fg-muted tabular-nums">{shop.rank}</span>,
    },
    {
      key: 's',
      label: t('mediaCosts.shop'),
      width: 'minmax(150px,1.6fr)',
      main: true,
      cell: (shop) => shop.name,
    },
    {
      key: 'r',
      label: t('mediaCosts.requests'),
      width: '110px',
      right: true,
      cell: (shop) => <span className="tabular-nums">{countWords(shop.requests)}</span>,
    },
    {
      key: 'b',
      label: t('mediaCosts.bytes'),
      width: '100px',
      right: true,
      cell: (shop) => <span className="tabular-nums">{bytesWords(shop.bytes)}</span>,
    },
  ];

  const r2Card = data.connected ? (
    <ConsoleCard>
      <CardHead title={t('mediaCosts.r2')} aside={<CardMoney>{dollars(r2.cost)}</CardMoney>} />
      <Kvs>
        <KvsRow
          label={
            <>
              {t('mediaCosts.classA')} <span className={NOTE}>· {t('mediaCosts.classAWhat')}</span>
              <div className={NOTE}>
                {line(
                  t('mediaCosts.millions', { n: millions(r2.classA.operations) }),
                  t('mediaCosts.millions', { n: prices.r2FreeClassAMillions }),
                  r2.classA.billableMillions,
                )}
              </div>
            </>
          }
          value={dollars(r2.classA.cost)}
        />
        <KvsRow
          label={
            <>
              {t('mediaCosts.classB')} <span className={NOTE}>· {t('mediaCosts.classBWhat')}</span>
              <div className={NOTE}>
                {line(
                  t('mediaCosts.millions', { n: millions(r2.classB.operations) }),
                  t('mediaCosts.millions', { n: prices.r2FreeClassBMillions }),
                  r2.classB.billableMillions,
                )}
              </div>
            </>
          }
          value={dollars(r2.classB.cost)}
        />
        <KvsRow
          label={
            <>
              {t('mediaCosts.storage')}
              <div className={NOTE}>
                {line(
                  t('mediaCosts.gbMonths', { n: r2.storage.gbMonths }),
                  t('mediaCosts.gbMonths', { n: prices.r2FreeStorageGbMonths }),
                  r2.storage.billableGbMonths,
                )}
              </div>
            </>
          }
          value={dollars(r2.storage.cost)}
        />
      </Kvs>
    </ConsoleCard>
  ) : null;

  const workersCard = (
    <ConsoleCard>
      <CardHead
        title={t('mediaCosts.worker')}
        aside={<CardMoney>{dollars(workers.cost)}</CardMoney>}
      />
      <Kvs>
        <KvsRow
          label={
            <>
              {t('mediaCosts.requests')}
              <div className={NOTE}>
                {t('mediaCosts.workerLine', {
                  n: prices.workersIncludedMillions,
                  b: workers.billableMillions,
                })}
              </div>
            </>
          }
          value={t('mediaCosts.millions', { n: millions(workers.requests) })}
        />
        <KvsRow label={t('mediaCosts.bytes')} value={bytesWords(workers.bytes)} />
        <KvsRow label={t('mediaCosts.monthly')} value={dollars(workers.monthly)} />
      </Kvs>
      <div className={`mt-2 ${NOTE}`}>{t('mediaCosts.notCounted')}</div>
    </ConsoleCard>
  );

  return (
    <ConsolePage>
      {head}
      {data.connected ? null : (
        <Banner tone="warn" icon="cloud">
          {t('mediaCosts.off')}
        </Banner>
      )}
      {budget.alertSentAt && budget.alertEmail ? (
        <Banner tone="warn" icon="mail">
          {t('mediaCosts.alerted', {
            e: budget.alertEmail,
            d: formatDay(budget.alertSentAt),
            p: budget.alertPercent,
          })}
        </Banner>
      ) : null}
      {budget.alertEmail ? null : (
        <Banner tone="info" icon="info">
          {t('mediaCosts.noEmail', { p: budget.alertPercent })}{' '}
          <Link to="/settings" className="font-semibold underline underline-offset-2">
            {t('mediaCosts.setIt')}
          </Link>
        </Banner>
      )}
      <RecordFigures four>
        <RecordFigure
          label={t('mediaCosts.estimate')}
          value={dollars(data.total)}
          detail={t('mediaCosts.daysRead', {
            n: data.period.daysRecorded,
            m: data.period.days,
          })}
          flagged={over}
        />
        <div className={`col-span-2 ${figureBox(false)}`}>
          <span className="text-[13px] font-medium text-fg-muted">
            {t('mediaCosts.budget')} · {dollars(budget.amount)}
          </span>
          <span
            className={`font-display text-[24px] leading-[1.1] font-extrabold tracking-[-0.02em] tabular-nums ${
              over ? 'text-warning' : ''
            }`}
          >
            {t('mediaCosts.used', { p: budget.usedPercent })}
          </span>
          <Meter
            used={Number(data.total)}
            limit={Number(budget.amount)}
            mark={budget.alertPercent}
          />
          <span className="text-[13px] text-fg-muted">
            {t('mediaCosts.alertAt', { p: budget.alertPercent })} ·{' '}
            {budget.alertEmail ?? t('mediaCosts.notSet')}
          </span>
        </div>
        <RecordFigure
          label={t('mediaCosts.lastRead')}
          value={data.connected && data.readAt ? formatSessionTime(data.readAt) : '—'}
          detail={data.connected && data.readAt ? t('mediaCosts.ago', { t: ago(data.readAt) }) : ''}
        />
      </RecordFigures>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {r2Card ?? workersCard}
        {r2Card ? workersCard : null}
      </div>
      {data.connected ? (
        <>
          <SectionTitle>{t('mediaCosts.buckets')}</SectionTitle>
          <DataTable
            columns={bucketColumns}
            rows={r2.buckets}
            rowKey={(bucket) => bucket.bucket || 'account'}
            empty={null}
          />
        </>
      ) : null}
      <SectionTitle>{t('mediaCosts.top')}</SectionTitle>
      <DataTable
        columns={shopColumns}
        rows={data.topShops.map((shop, index) => ({ ...shop, rank: index + 1 }))}
        rowKey={(shop) => shop.tenantId}
        empty={null}
      />
      <div className={NOTE}>
        {t('mediaCosts.prices', {
          a: usd(prices.r2ClassAPerMillion),
          b: usd(prices.r2ClassBPerMillion),
          c: `$${String(prices.r2StoragePerGbMonth)}`,
          d: usd(prices.workersMonthly),
          e: usd(prices.workersPerMillion),
          f: prices.workersIncludedMillions,
        })}{' '}
        <Link to="/settings" className="text-primary-text underline-offset-2 hover:underline">
          {t('nav.settings')}
        </Link>
      </div>
    </ConsolePage>
  );
}
