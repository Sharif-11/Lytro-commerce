import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { Permission, SalesBucket } from '@lytronix/validators';
import { useSales } from '@/api/sales';
import { useInventoryFigures } from '@/api/stock';
import { ErrorBanner } from '@/components/error-banner';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { Kv } from '@/components/ui/kv';
import { Eyebrow } from '@/components/ui/page';
import { SkeletonRows } from '@/components/ui/skeleton';
import { todayInputValue } from '@/lib/dates';
import { periodOf } from '@/lib/sales-period';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import { useCountedText } from '../product/stock-holders';

/** A card's own list of figures under its eyebrow, the rows kept 16 px in from its edge. */
function FigureList({
  head,
  children,
}: {
  head: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <Card flush>
      <div className="px-4 pt-3 pb-1">
        <Eyebrow>{head}</Eyebrow>
      </div>
      <div className="px-4 pb-1">{children}</div>
    </Card>
  );
}

/**
 * This month's profit beside stock value (TENANT-DASHBOARD-DESIGN §7.34, `stock-value32`, agreed): its two parts and a
 * way to Sales. It comes from the orders, so someone who may see costs but not orders doesn't get it.
 */
function ProfitNow(): React.JSX.Element | null {
  const { t } = useTranslation('orders');
  const { slug, viewer } = useShell();
  const mayRead = allows(viewer, [Permission.OrdersRead]);
  const sales = useSales(
    { ...periodOf('thisMonth', todayInputValue()), bucket: SalesBucket.Month },
    { enabled: mayRead },
  );
  const profit = sales.data?.totals.profit;
  if (!mayRead || !profit) return null;
  return (
    <Card>
      <Eyebrow>{t('saProfitBeside')}</Eyebrow>
      <div className="num mt-1 text-[28px] font-extrabold">{formatTaka(profit.profit)}</div>
      <p className="text-[14px] text-fg-muted">
        {t('saLessTax')} {formatTaka(profit.revenueLessTax)} · {t('saCost')}{' '}
        {formatTaka(profit.costOfGoods)}
      </p>
      <div className="mt-2.5">
        <Link to="/$shop/sales" params={{ shop: slug }} className={buttonClass('outline', 'sm')}>
          {t('saSeeSales')}
        </Link>
      </div>
    </Card>
  );
}

/**
 * Stock value and losses (TENANT-DASHBOARD-DESIGN §7.22, the prototype's `stock-value`; INV-18, D3-9), for someone who
 * may see costs: this month's profit, what is on hand at average cost now and in which units, the same by category, and
 * this month's losses by reason with the units each took.
 */
export function StockValueView(): React.JSX.Element {
  const { t } = useTranslation('shop');
  const figures = useInventoryFigures({ enabled: true });
  const counted = useCountedText();
  const unitsText = (units: readonly { unit: string; quantity: string }[]): string =>
    units.map((each) => counted(each.quantity, each.unit)).join(' · ');
  const data = figures.data;

  return (
    <ShellPage>
      <p className="text-[14px] text-fg-muted">{t('svLead')}</p>
      {figures.isError ? <ErrorBanner error={figures.error} /> : null}
      {!data ? (
        figures.isPending ? (
          <Card flush>
            <SkeletonRows count={4} />
          </Card>
        ) : null
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_340px] lg:gap-6">
          <div className="flex flex-col gap-4">
            <ProfitNow />
            <Card>
              <Eyebrow>{t('svTotal')}</Eyebrow>
              <div className="num mt-1 text-[28px] font-extrabold">
                {formatTaka(data.stockValue.value)}
              </div>
              <p className="text-[14px] text-fg-muted">
                {[unitsText(data.stockValue.units), t('svAtAvg')].filter(Boolean).join(' · ')}
              </p>
            </Card>
            <FigureList head={t('svByCat')}>
              {data.stockValue.byCategory.map((each) => (
                <Kv
                  key={each.categoryId ?? 'none'}
                  label={each.name ?? t('uncategorized')}
                  value={formatTaka(each.value)}
                />
              ))}
            </FigureList>
          </div>
          <FigureList head={`${t('svLosses')} · ${formatTaka(data.losses.value)}`}>
            {data.losses.byReason.length === 0 ? (
              <p className="py-2 text-[15px] text-fg-muted">{t('lossesNone')}</p>
            ) : (
              data.losses.byReason.map((each) => {
                const reason = t(`loss_${each.reason}`);
                return (
                  <Kv
                    key={each.reason}
                    label={[reason.charAt(0).toUpperCase() + reason.slice(1), unitsText(each.units)]
                      .filter(Boolean)
                      .join(' · ')}
                    value={formatTaka(each.value)}
                  />
                );
              })
            )}
            <p className="pt-2 pb-2.5 text-[14px] text-fg-muted">{t('svGate')}</p>
          </FigureList>
        </div>
      )}
    </ShellPage>
  );
}
