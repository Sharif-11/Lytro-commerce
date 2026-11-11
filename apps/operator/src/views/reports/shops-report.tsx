import { useTranslation } from 'react-i18next';
import { TenantState, type SalesBucket } from '@lytronix/validators';
import { useShopsReport } from '@/api/reports';
import { ConsoleCard, SectionTitle } from '@/components/ui/console-page';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { NOTE } from '@/components/ui/sizes';
import { formatDay } from '@/lib/format';
import type { ShopMovements } from '@/types/records';
import { BigCount, CardHead, Kvs, KvsRow, Meter } from '@/views/records/parts';
import { ShopStateChip } from '@/views/shops/shop-state-chip';
import type { Period } from './period';

// Every state a shop can be counted in, in the order a shop moves through them; a deleted shop isn't counted.
const STATES: readonly TenantState[] = [
  TenantState.Trial,
  TenantState.PayAsYouGo,
  TenantState.Active,
  TenantState.Grace,
  TenantState.ReadOnly,
  TenantState.Locked,
  TenantState.Archived,
];

type Row = ShopMovements & { from: string; to: string; total?: boolean };

/** §10e's shops: by state and plan now, and those that opened, first paid and lapsed in each split. */
export function ShopsReportView({
  period,
  split,
}: {
  period: Period;
  split: SalesBucket;
}): React.JSX.Element {
  const { t } = useTranslation();
  const report = useShopsReport(period, split);
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
  if (data?.now.total === 0) {
    return (
      <section className="overflow-hidden rounded-card border border-line bg-surface">
        <EmptyBox icon="store" title={t('records.none')} hint="" />
      </section>
    );
  }
  const count = (value: number, bold: boolean) =>
    bold ? <b className="tabular-nums">{value}</b> : <span className="tabular-nums">{value}</span>;
  const columns: Column<Row>[] = [
    {
      key: 'p',
      label: t('records.period'),
      width: 'minmax(130px,1.4fr)',
      main: true,
      cell: (row) =>
        row.total
          ? t('records.total')
          : `${formatDay(`${row.from}T12:00:00+06:00`)} – ${formatDay(`${row.to}T12:00:00+06:00`)}`,
    },
    {
      key: 'o',
      label: t('records.opened'),
      width: 'minmax(80px,1fr)',
      right: true,
      cell: (row) => count(row.opened, row.total === true),
    },
    {
      key: 'f',
      label: t('records.firstPaid'),
      width: 'minmax(80px,1fr)',
      right: true,
      cell: (row) => count(row.becamePaying, row.total === true),
    },
    {
      key: 'l',
      label: t('records.lapsed'),
      width: 'minmax(80px,1fr)',
      right: true,
      cell: (row) => count(row.lapsed, row.total === true),
    },
  ];
  const rows: Row[] = data
    ? [...data.buckets, { ...data.total, from: data.dateFrom, to: data.dateTo, total: true }]
    : [];
  const byState = new Map(data?.now.byState.map((each) => [each.state, each.count]));
  return (
    <>
      {data ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ConsoleCard>
            <CardHead title={t('records.byState')} aside={<BigCount>{data.now.total}</BigCount>} />
            <Kvs>
              {STATES.map((state) => (
                <KvsRow
                  key={state}
                  label={<ShopStateChip state={state} />}
                  value={byState.get(state) ?? 0}
                />
              ))}
            </Kvs>
          </ConsoleCard>
          <ConsoleCard>
            <CardHead title={t('records.byPlan')} />
            <div className="mt-2">
              {data.now.byPlan.map((plan) => (
                <div
                  key={plan.payAsYouGo ? 'payg' : (plan.planId ?? 'none')}
                  className="flex flex-col gap-1.5 border-t border-line py-2.5 first:border-t-0"
                >
                  <div className="flex flex-wrap justify-between gap-3 text-[14px]">
                    <span>
                      {plan.payAsYouGo
                        ? t('records.payAsYouGo')
                        : (plan.planName ?? t('records.noPlan'))}
                    </span>
                    <span className="text-[13px] text-fg-muted tabular-nums">{plan.count}</span>
                  </div>
                  <Meter used={plan.count} limit={data.now.total} />
                </div>
              ))}
            </div>
          </ConsoleCard>
        </div>
      ) : null}
      <SectionTitle>{t('records.moves')}</SectionTitle>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => (row.total ? 'total' : row.from)}
        rowClass={(row) => (row.total ? 'bg-neutral-50 font-bold' : '')}
        loading={report.isPending}
        empty={null}
      />
      <div className={NOTE}>{t('records.shopsNote')}</div>
    </>
  );
}
