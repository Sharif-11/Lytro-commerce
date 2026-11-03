import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { SalesBucket, StockUnit } from '@lytronix/validators';
import { useSales } from '@/api/sales';
import { Banner } from '@/components/ui/banner';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatRow, StatTile } from '@/components/ui/stat-tile';
import { useErrorText } from '@/hooks/use-error-text';
import { todayInputValue } from '@/lib/dates';
import { trendPeriod } from '@/lib/sales-period';
import { ShellPage } from '@/shell/shell-page';
import type { SalesFigure } from '@/types/sales';
import { useCountedText } from '@/views/product/stock-holders';
import { SalesChart } from './sales-chart';
import { inMonth } from './sales-words';

const unitsOf = (figure: SalesFigure | undefined): number =>
  (figure?.units ?? []).reduce((sum, each) => sum + Number(each.quantity), 0);

/**
 * A product's trend (TENANT-DASHBOARD-DESIGN §7.34, the prototype's `sales32-product`; STA-03): the last 12 months, month
 * by month, with this month's units beside last month's and its revenue. Not sold in that time, it says so
 * (`sales32-product-none`).
 */
export function ProductTrend({
  productId,
  name,
}: {
  productId: string;
  name: string | undefined;
}): React.JSX.Element {
  const { t, i18n } = useTranslation('orders');
  const errorText = useErrorText();
  const counted = useCountedText();
  const trend = useSales({
    ...trendPeriod(todayInputValue()),
    bucket: SalesBucket.Month,
    productId,
  });
  const rows = trend.data?.buckets ?? [];
  const latest = rows.at(-1);
  const before = rows.at(-2);
  const heading = name ? t('saTrend', { name }) : t('saTrendPlain');
  const now = unitsOf(latest);
  const then = unitsOf(before);
  const unit = latest?.units[0]?.unit ?? before?.units[0]?.unit;
  const unitsText = (units: number): string =>
    unit && unit !== StockUnit.Piece ? counted(String(units), unit) : String(units);

  return (
    <ShellPage sectionChips>
      {trend.isError ? <Banner tone="bad">{errorText(trend.error)}</Banner> : null}
      {trend.isPending ? (
        <Card flush>
          <SkeletonRows count={4} />
        </Card>
      ) : null}
      {trend.data && trend.data.totals.orders === 0 ? (
        <Card>
          <h3 className="text-[17px] font-semibold">{heading}</h3>
          <EmptyState icon="trend">{t('saTrendNone')}</EmptyState>
        </Card>
      ) : null}
      {trend.data && trend.data.totals.orders > 0 ? (
        <>
          <Card>
            <h3 className="text-[17px] font-semibold">{heading}</h3>
            <div className="mt-2.5">
              <StatRow label={heading}>
                <StatTile
                  label={t('saTrendUnits')}
                  value={unitsText(now)}
                  note={
                    before
                      ? t('saInMonth', {
                          n: unitsText(then),
                          month: inMonth(before.from, i18n.language),
                        })
                      : undefined
                  }
                  noteTone={now > then ? 'good' : now < then ? 'bad' : 'plain'}
                />
                <StatTile label={t('saRevenue')} value={formatTaka(latest?.revenue ?? '0')} />
              </StatRow>
            </div>
          </Card>
          <SalesChart bucket={SalesBucket.Month} rows={rows} title={t('saByMonth')} />
        </>
      ) : null}
    </ShellPage>
  );
}
