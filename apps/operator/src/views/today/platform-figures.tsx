import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { SalesBucket } from '@lytronix/validators';
import { useRevenueReport, useShopsReport } from '@/api/reports';
import { ConsoleCard } from '@/components/ui/console-page';
import { taka } from '@/lib/format';
import { Kvs, KvsRow } from '@/views/records/parts';
import { presetPeriod } from '@/views/reports/period';

/** ADM-09 (§3, v7): this month so far from the reports: the shops there are, those opened, and what Lytro earned. */
export function PlatformFigures(): React.JSX.Element {
  const { t } = useTranslation();
  const month = presetPeriod('thisMonth');
  const shops = useShopsReport(month, SalesBucket.Month);
  const revenue = useRevenueReport(month, SalesBucket.Month);
  return (
    <ConsoleCard>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="mb-1 text-[16px] font-semibold">{t('today.figures')}</h3>
        <Link
          to="/reports"
          className="inline-flex items-center gap-1 text-[14px] font-medium whitespace-nowrap text-primary"
        >
          {t('today.openReports')}
        </Link>
      </div>
      <div className="text-[13px] text-fg-muted">{t('today.figuresThisMonth')}</div>
      <div className="pt-0.5">
        <Kvs>
          <KvsRow label={t('today.figuresShops')} value={shops.data?.now.total ?? '—'} />
          <KvsRow label={t('today.figuresOpened')} value={shops.data?.total.opened ?? '—'} />
          <KvsRow
            label={t('today.figuresEarned')}
            value={revenue.data ? taka(revenue.data.total.earned) : '—'}
          />
        </Kvs>
      </div>
    </ConsoleCard>
  );
}
