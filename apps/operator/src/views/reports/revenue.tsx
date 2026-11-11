import { useTranslation } from 'react-i18next';
import { SalesBucket } from '@lytronix/validators';
import { useRevenueReport } from '@/api/reports';
import { ConsoleCard } from '@/components/ui/console-page';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { NOTE } from '@/components/ui/sizes';
import { formatDay } from '@/lib/format';
import type { RevenueFigures } from '@/types/records';
import { CardHead, Kvs, KvsHead, KvsRow, RecordFigure, RecordFigures } from '@/views/records/parts';
import { takaSigned } from '@/views/records/numbers';
import type { Period } from './period';

const WALLET_KINDS = ['purchase', 'renewal', 'upgrade', 'addon'] as const;

const sum = (values: readonly (string | undefined)[]): number =>
  values.reduce((total, value) => total + Number(value ?? 0), 0);

/** D8-40: the four parts of what was earned, as the sketch adds them up. */
function partsOf(figures: RevenueFigures): {
  wallets: number;
  balances: number;
  byHand: number;
  givenBack: number;
  earned: number;
} {
  return {
    wallets: sum(Object.values(figures.wallet)),
    balances: sum(Object.values(figures.balance)),
    byHand: Number(figures.manual.plans) - Number(figures.manual.plansReversed),
    givenBack: Number(figures.givenBack),
    earned: Number(figures.earned),
  };
}

type Row = RevenueFigures & { from: string; to: string; total?: boolean };

/** Whether nothing at all moved in the period. */
function nothingIn(figures: RevenueFigures): boolean {
  const parts = partsOf(figures);
  return (
    parts.wallets === 0 &&
    parts.balances === 0 &&
    parts.byHand === 0 &&
    parts.givenBack === 0 &&
    Number(figures.manual.topUps) === 0 &&
    Number(figures.manual.topUpsReversed) === 0
  );
}

/** §10e's revenue: the four figures, each split's line with the total, and how the total is made. */
export function RevenueReportView({
  period,
  split,
}: {
  period: Period;
  split: SalesBucket;
}): React.JSX.Element {
  const { t } = useTranslation();
  const report = useRevenueReport(period, split);
  if (report.isError) {
    return (
      <LoadFailed
        onRetry={() => {
          void report.refetch();
        }}
      />
    );
  }
  const data = report.data;
  if (data && nothingIn(data.total)) {
    return (
      <section className="overflow-hidden rounded-card border border-line bg-surface">
        <EmptyBox icon="chart" title={t('records.none')} hint={t('records.revenueNote')} />
      </section>
    );
  }
  const total = data ? partsOf(data.total) : null;
  const label = (row: Row): string =>
    row.total
      ? t('records.total')
      : split === SalesBucket.Month
        ? new Date(`${row.from}T12:00:00+06:00`).toLocaleDateString('en-GB', { month: 'long' })
        : `${formatDay(`${row.from}T12:00:00+06:00`)} – ${formatDay(`${row.to}T12:00:00+06:00`)}`;
  const figure = (value: number, bold = false) =>
    bold ? (
      <b className="tabular-nums">{takaSigned(value)}</b>
    ) : (
      <span className="tabular-nums">{takaSigned(value)}</span>
    );
  const columns: Column<Row>[] = [
    {
      key: 'p',
      label: t('records.period'),
      width: 'minmax(120px,1.2fr)',
      main: true,
      cell: label,
    },
    {
      key: 'w',
      label: t('records.wallets'),
      width: 'minmax(84px,1fr)',
      right: true,
      cell: (row) => figure(partsOf(row).wallets),
    },
    {
      key: 'b',
      label: t('records.balances'),
      width: 'minmax(84px,1fr)',
      right: true,
      cell: (row) => figure(partsOf(row).balances),
    },
    {
      key: 'h',
      label: t('records.byHand'),
      width: 'minmax(80px,.9fr)',
      right: true,
      cell: (row) => figure(partsOf(row).byHand),
    },
    {
      key: 'g',
      label: t('records.givenBack'),
      width: 'minmax(70px,.8fr)',
      right: true,
      cell: (row) => figure(-partsOf(row).givenBack),
    },
    {
      key: 'e',
      label: t('records.earned'),
      width: 'minmax(84px,1fr)',
      right: true,
      cell: (row) => figure(partsOf(row).earned, true),
    },
  ];
  const rows: Row[] = data
    ? [...data.buckets, { ...data.total, from: data.dateFrom, to: data.dateTo, total: true }]
    : [];
  const manual = data?.total.manual;
  return (
    <>
      <RecordFigures four>
        <RecordFigure
          label={t('records.earned')}
          value={total ? takaSigned(total.earned) : '—'}
          detail={t('records.earnedDetail')}
        />
        <RecordFigure
          label={t('records.wallets')}
          value={total ? takaSigned(total.wallets) : '—'}
          detail={t('records.walletsDetail')}
        />
        <RecordFigure
          label={t('records.balances')}
          value={total ? takaSigned(total.balances) : '—'}
          detail={t('records.balancesDetail')}
        />
        <RecordFigure
          label={t('records.byHand')}
          value={total ? takaSigned(total.byHand) : '—'}
          detail={t('records.byHandDetail', {
            a: takaSigned(manual ? Number(manual.topUps) - Number(manual.topUpsReversed) : 0),
          })}
          to="/manual"
        />
      </RecordFigures>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => (row.total ? 'total' : row.from)}
        rowClass={(row) => (row.total ? 'bg-neutral-50 font-bold' : '')}
        loading={report.isPending}
        empty={null}
      />
      {data ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ConsoleCard>
            <CardHead title={t('records.breakdown')} />
            <Kvs>
              <KvsHead>{t('records.wallets')}</KvsHead>
              {WALLET_KINDS.map((each) => (
                <KvsRow
                  key={each}
                  label={t(`records.walletKinds.${each}`)}
                  value={takaSigned(data.total.wallet[each])}
                />
              ))}
              <KvsHead>{t('records.balances')}</KvsHead>
              {Object.entries(data.total.balance)
                .filter(([, value]) => Number(value) !== 0)
                .map(([type, value]) => (
                  <KvsRow
                    key={type}
                    label={t(`records.ledger.${type}`)}
                    value={takaSigned(value)}
                  />
                ))}
            </Kvs>
          </ConsoleCard>
          <ConsoleCard>
            <CardHead title={t('records.byHand')} />
            <Kvs>
              <KvsRow
                label={t('records.manualPlans')}
                value={takaSigned(data.total.manual.plans)}
              />
              <KvsRow
                label={t('records.manualPlansReversed')}
                value={takaSigned(-Number(data.total.manual.plansReversed))}
              />
              <KvsRow
                label={t('records.manualTopUps')}
                value={takaSigned(data.total.manual.topUps)}
              />
              <KvsRow
                label={t('records.manualTopUpsReversed')}
                value={takaSigned(-Number(data.total.manual.topUpsReversed))}
              />
              <KvsRow
                label={t('records.givenBack')}
                value={takaSigned(-Number(data.total.givenBack))}
                total
              />
            </Kvs>
            <div className={`mt-3 ${NOTE}`}>
              {t('records.revenueNote')}
              {data.recordedSince
                ? ` ${t('records.recordedSince', { d: formatDay(`${data.recordedSince}T12:00:00+06:00`) })}`
                : ''}
            </div>
          </ConsoleCard>
        </div>
      ) : null}
    </>
  );
}
