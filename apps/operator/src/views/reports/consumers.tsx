import { useTranslation } from 'react-i18next';
import { ConsumerMetric } from '@lytronix/validators';
import { useConsumersReport } from '@/api/reports';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { CELL_NOTE } from '@/components/ui/sizes';
import type { ConsumersReport } from '@/types/records';
import { bytesWords, countWords, phoneWords } from '@/views/records/numbers';
import type { Period } from './period';

type Row = ConsumersReport['shops'][number] & { rank: number };

/** §10e's top consumers: the 20 shops that used most in the period, each with its owner's phone to call. */
export function ConsumersReportView({
  period,
  metric,
}: {
  period: Period;
  metric: ConsumerMetric;
}): React.JSX.Element {
  const { t } = useTranslation();
  const report = useConsumersReport(period, metric);
  if (report.isError) {
    return (
      <LoadFailed
        onRetry={() => {
          void report.refetch();
        }}
      />
    );
  }
  const columns: Column<Row>[] = [
    {
      key: 'n',
      label: '#',
      width: '36px',
      cell: (row) => <span className="text-fg-muted tabular-nums">{row.rank}</span>,
    },
    {
      key: 's',
      label: t('records.shop'),
      width: 'minmax(150px,1.6fr)',
      main: true,
      cell: (row) => (
        <>
          <div>{row.name}</div>
          <div className={CELL_NOTE}>{row.slug}.lytro.app</div>
        </>
      ),
    },
    {
      key: 'p',
      label: t('records.ownerPhone'),
      width: '120px',
      cell: (row) => (
        <span className="mono">{row.ownerPhone ? phoneWords(row.ownerPhone) : '—'}</span>
      ),
    },
    {
      key: 'v',
      label: t('records.used'),
      width: '90px',
      right: true,
      cell: (row) => (
        <span className="tabular-nums">
          {metric === ConsumerMetric.Sms
            ? t('records.smsUnits', { n: countWords(row.value) })
            : bytesWords(row.value)}
        </span>
      ),
    },
  ];
  return (
    <DataTable
      columns={columns}
      rows={(report.data?.shops ?? []).map((shop, index) => ({ ...shop, rank: index + 1 }))}
      rowKey={(row) => row.id}
      loading={report.isPending}
      empty={<EmptyBox icon="chart" title={t('records.none')} hint="" />}
    />
  );
}
