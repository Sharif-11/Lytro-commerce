import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { SalesBucket, SalesRanking } from '@lytronix/validators';
import { useSales } from '@/api/sales';
import { ErrorBanner } from '@/components/error-banner';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Kv } from '@/components/ui/kv';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatRow, StatTile } from '@/components/ui/stat-tile';
import { todayInputValue } from '@/lib/dates';
import {
  bucketFor,
  longestPeriod,
  periodOf,
  type PeriodKey,
  type SalesPeriod,
} from '@/lib/sales-period';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { SalesProfit } from '@/types/sales';
import { Segments } from '@/views/product/value-sheet';
import { BestSellersCard } from './best-sellers';
import { PeriodSheet } from './period-sheet';
import { SalesChart } from './sales-chart';
import { usePeriodWords } from './sales-words';

export interface SalesSearch {
  period?: PeriodKey;
  from?: string;
  to?: string;
  bucket?: SalesBucket;
  by?: SalesRanking;
}

/** The period the address holds: picked dates when both are there, else a named one, this month by default. */
function periodFrom(search: SalesSearch, today: string): SalesPeriod {
  if (search.period === 'custom' && search.from && search.to) {
    return { key: 'custom', from: search.from, to: search.to };
  }
  const key = search.period && search.period !== 'custom' ? search.period : 'thisMonth';
  return periodOf(key, today);
}

/** Profit (the prototype's `sa32Profit`; INV-18, D3-9): the items less their tax, less the cost of the goods kept. */
function ProfitCard({ profit }: { profit: SalesProfit }): React.JSX.Element {
  const { t } = useTranslation('orders');
  return (
    <Card>
      <h3 className="text-[17px] font-semibold">{t('saProfit')}</h3>
      <Kv label={t('saLessTax')} value={formatTaka(profit.revenueLessTax)} />
      <Kv label={t('saCost')} value={`−${formatTaka(profit.costOfGoods)}`} />
      <Kv total label={t('saProfit')} value={formatTaka(profit.profit)} />
      <p className="mt-1.5 text-[14px] text-fg-muted">
        {profit.unknownCost > 0 ? `${t('saUnknown', { count: profit.unknownCost })} ` : null}
        {t('saProfitHelp')}
      </p>
    </Card>
  );
}

/**
 * Sales (TENANT-DASHBOARD-DESIGN §7.34, the prototype's `sales32`; STA-01 to STA-04): the Orders hub's third tab. A
 * period and its split, which follows the period until the seller changes it (agreed 2026-11-03), held in the address so
 * Back returns to the same view; the orders, revenue and delivery charges; revenue by each week, month, quarter or year;
 * profit for whoever may see costs; the best sellers. A shop that has never delivered says so, and a period with nothing
 * delivered says that instead.
 */
export function SalesScreen({ search }: { search: SalesSearch }): React.JSX.Element {
  const { t } = useTranslation('orders');
  const navigate = useNavigate();
  const { slug } = useShell();
  const periodWords = usePeriodWords();
  const [choosing, setChoosing] = useState(false);
  const today = todayInputValue();
  const period = periodFrom(search, today);
  const bucket = search.bucket ?? bucketFor(period);
  const by = search.by ?? SalesRanking.Units;
  const sales = useSales({ from: period.from, to: period.to, bucket });
  const data = sales.data;
  const nothing = data?.totals.orders === 0;
  // Only asked when this period is empty, to tell a shop that never sold from one that sold at another time.
  const ever = useSales(
    { ...longestPeriod(today), bucket: SalesBucket.Year },
    { enabled: nothing },
  );

  const show = (patch: SalesSearch): void => {
    void navigate({
      to: '/$shop/sales',
      params: { shop: slug },
      search: { ...search, ...patch },
      replace: true,
    });
  };
  const titles: Record<SalesBucket, string> = {
    [SalesBucket.Week]: t('saByWeek'),
    [SalesBucket.Month]: t('saByMonth'),
    [SalesBucket.Quarter]: t('saByQuarter'),
    [SalesBucket.Year]: t('saByYear'),
  };

  return (
    <ShellPage>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          tone="outline"
          size="sm"
          onClick={() => {
            setChoosing(true);
          }}
        >
          <Icon name="calendar" />
          {periodWords(period)}
          <Icon name="down" />
        </Button>
        <div className="min-w-60 flex-1">
          <Segments
            label={t('saSplit')}
            value={bucket}
            choices={[
              { value: SalesBucket.Week, label: t('saWeek') },
              { value: SalesBucket.Month, label: t('saMonth') },
              { value: SalesBucket.Quarter, label: t('saQuarter') },
              { value: SalesBucket.Year, label: t('saYear') },
            ]}
            onChange={(next) => {
              show({ bucket: next });
            }}
          />
        </div>
      </div>
      {sales.isError ? <ErrorBanner error={sales.error} /> : null}
      {sales.isPending ? (
        <Card flush>
          <SkeletonRows count={4} />
        </Card>
      ) : null}
      {data && nothing ? (
        ever.data ? (
          <Card>
            <EmptyState icon="trend">
              {ever.data.totals.orders > 0 ? t('saNone') : t('saEmpty')}
            </EmptyState>
          </Card>
        ) : (
          <Card flush>
            <SkeletonRows count={2} />
          </Card>
        )
      ) : null}
      {data && !nothing ? (
        <>
          <StatRow label={t('saFigures')}>
            <StatTile label={t('saOrders')} value={data.totals.orders} />
            <StatTile
              label={t('saRevenue')}
              value={formatTaka(data.totals.revenue)}
              note={
                Number(data.totals.tax) > 0
                  ? t('saTaxIn', { amount: formatTaka(data.totals.tax) })
                  : undefined
              }
            />
            <StatTile
              label={t('saDelivery')}
              value={formatTaka(data.totals.deliveryCharges ?? '0')}
              note={t('saDeliveryD')}
            />
            {/* CRR-17 (Part 36's `c36-sales`): what couriers charged, where a courier said, beside what shoppers paid. */}
            <StatTile
              label={t('crCourierCharges')}
              value={formatTaka(data.totals.courierCharges ?? '0')}
              note={
                data.totals.unknownCourierCharges
                  ? t('crCourierChargesD', { count: data.totals.unknownCourierCharges })
                  : undefined
              }
            />
          </StatRow>
          <div className="flex flex-col gap-section lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-columns [&>*]:min-w-0">
            <SalesChart bucket={data.bucket} rows={data.buckets} title={titles[data.bucket]} />
            <div className="flex flex-col gap-section">
              {data.totals.profit ? (
                <ProfitCard profit={data.totals.profit} />
              ) : (
                <p className="text-[14px]">{t('saProfitHidden')}</p>
              )}
              <BestSellersCard
                from={period.from}
                to={period.to}
                by={by}
                onBy={(next) => {
                  show({ by: next });
                }}
              />
            </div>
          </div>
          <p className="text-[14px]">{t('saHow')}</p>
        </>
      ) : null}
      {choosing ? (
        <PeriodSheet
          period={period}
          onDone={(next) => {
            setChoosing(false);
            // A new period takes the split it opens with (agreed 2026-11-03).
            show({
              period: next.key,
              from: next.key === 'custom' ? next.from : undefined,
              to: next.key === 'custom' ? next.to : undefined,
              bucket: undefined,
            });
          }}
          onClose={() => {
            setChoosing(false);
          }}
        />
      ) : null}
    </ShellPage>
  );
}
