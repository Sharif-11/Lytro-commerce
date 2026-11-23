import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePaygFairUseReport, type PaygFairUseRow } from '@/api/reports';
import { Banner } from '@/components/ui/banner';
import { Chip, Chips } from '@/components/ui/chips';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsolePage, PageTitle } from '@/components/ui/console-page';
import { DataTable, type Column } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { CELL_NOTE, NOTE } from '@/components/ui/sizes';
import { StatusChip } from '@/components/ui/status-chip';
import { taka } from '@/lib/format';

type Filter = 'all' | 'watch' | 'paused';

const count = (value: number): string => value.toLocaleString('en-IN');

/**
 * PAYG-FAIR-USE-PLAN PF-16, PF-38 (the sketch's `pf-report`): pay-as-you-go shops over the last 30 days -- the orders
 * that came through Lytro against those the seller opened (৳7) and confirmed (৳3), the API's requests and charge, the
 * fees earned, the balance and whether the storefront is active. Watch marks 20 or more orders with under 25% opened.
 */
export function PaygFairUseReportView(): React.JSX.Element {
  const { t } = useTranslation();
  const report = usePaygFairUseReport();
  const [filter, setFilter] = useState<Filter>('all');
  const rows = report.data?.rows ?? [];
  const watched = rows.filter((row) => row.watch);
  const paused = rows.filter((row) => !row.storefrontActive);
  const shown = filter === 'watch' ? watched : filter === 'paused' ? paused : rows;
  const columns: Column<PaygFairUseRow>[] = [
    {
      key: 'shop',
      label: t('payg.shop'),
      width: 'minmax(170px,2fr)',
      main: true,
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <b className="font-semibold">
            {row.shopName}
            {row.watch ? (
              <span className="ml-1.5">
                <StatusChip tone="warn">{t('payg.watch')}</StatusChip>
              </span>
            ) : null}
          </b>
          <small className={CELL_NOTE}>{row.slug}.lytro.app</small>
        </span>
      ),
    },
    {
      key: 'in',
      label: t('payg.received'),
      width: 'minmax(64px,1fr)',
      right: true,
      cell: (row) => count(row.received),
    },
    {
      key: 'opened',
      label: t('payg.opened'),
      width: 'minmax(64px,1fr)',
      right: true,
      cell: (row) => count(row.opened),
    },
    {
      key: 'confirmed',
      label: t('payg.confirmed'),
      width: 'minmax(64px,1fr)',
      right: true,
      cell: (row) => count(row.confirmed),
    },
    {
      key: 'rate',
      label: t('payg.openRate'),
      width: 'minmax(64px,1fr)',
      right: true,
      cell: (row) =>
        row.openRate === null ? (
          '—'
        ) : (
          <span className={row.watch ? 'font-semibold text-danger-text' : ''}>
            {String(row.openRate)}%
          </span>
        ),
    },
    {
      key: 'api',
      label: t('payg.apiRequests'),
      width: 'minmax(64px,1fr)',
      right: true,
      cell: (row) => count(row.apiRequests),
    },
    {
      key: 'apiCharged',
      label: t('payg.apiCharged'),
      width: 'minmax(64px,1fr)',
      right: true,
      cell: (row) => taka(row.apiCharged),
    },
    {
      key: 'fees',
      label: t('payg.fees'),
      width: 'minmax(64px,1fr)',
      right: true,
      cell: (row) => taka(row.feesEarned),
    },
    {
      key: 'balance',
      label: t('payg.balance'),
      width: 'minmax(64px,1fr)',
      right: true,
      cell: (row) => taka(row.balance),
    },
    {
      key: 'storefront',
      label: t('payg.storefront'),
      width: 'minmax(64px,1fr)',
      cell: (row) =>
        row.storefrontActive ? (
          <StatusChip tone="ok">{t('payg.active')}</StatusChip>
        ) : (
          <StatusChip tone="mute">{t('payg.paused')}</StatusChip>
        ),
    },
  ];
  return (
    <ConsolePage>
      <PageTitle title={t('payg.title')} lead={t('payg.lead')} />
      {report.data && !report.data.fairUseOn ? (
        <Banner tone="info" icon="info">
          {t('payg.switchOff')}
        </Banner>
      ) : null}
      <Chips>
        <Chip
          on={filter === 'all'}
          count={rows.length}
          onClick={() => {
            setFilter('all');
          }}
        >
          {t('payg.all')}
        </Chip>
        <Chip
          on={filter === 'watch'}
          count={watched.length}
          onClick={() => {
            setFilter('watch');
          }}
        >
          {t('payg.watch')}
        </Chip>
        <Chip
          on={filter === 'paused'}
          count={paused.length}
          onClick={() => {
            setFilter('paused');
          }}
        >
          {t('payg.paused')}
        </Chip>
      </Chips>
      {report.isError ? (
        <LoadFailed
          onRetry={() => {
            void report.refetch();
          }}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={(row) => row.tenantId}
          loading={report.isPending}
          empty={t('payg.empty')}
        />
      )}
      <div className={`${NOTE} flex items-start gap-1.5`}>
        <ConsoleIcon name="info" size={16} />
        <span>{t('payg.note')}</span>
      </div>
    </ConsolePage>
  );
}
