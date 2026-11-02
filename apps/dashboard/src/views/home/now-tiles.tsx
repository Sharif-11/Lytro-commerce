import { useTranslation } from 'react-i18next';
import { Permission, TenantState } from '@lytronix/validators';
import { daysUntil, formatTaka } from '@lytronix/ui';
import { SectionHead } from '@/components/ui/page';
import { StatRow, StatTile } from '@/components/ui/stat-tile';
import { Taka } from '@/components/ui/taka';
import { formatDayMonth } from '@/lib/dates';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import type { HomeView } from '@/types/home';

/**
 * "Today" (TENANT-DASHBOARD-DESIGN §7.32, the prototype's `p30-home`): orders placed today with yesterday's beside it,
 * the orders to ship, and this month's sales -- the Sales page's own figure (delivered orders by the day they were
 * placed, STA-01). For whoever may read orders, once there is anything to say: a new shop has its checklist instead.
 */
export function TodayTiles({ home }: { home: HomeView }): React.JSX.Element | null {
  const { t } = useTranslation('home');
  const orders = home.orders;
  if (!orders) return null;
  const nothing =
    orders.today + orders.yesterday + orders.toShip === 0 && Number(orders.monthSales) === 0;
  if (nothing) return null;
  return (
    <div>
      <SectionHead>{t('todayTitle')}</SectionHead>
      <div className="mt-2">
        <StatRow label={t('todayTitle')}>
          <StatTile
            label={t('stOrdersToday')}
            value={orders.today}
            note={t('vsYesterday', { n: orders.yesterday })}
            noteTone="good"
          />
          <StatTile label={t('stToShip')} value={orders.toShip} />
          <StatTile
            label={t('stMonthSales')}
            value={formatTaka(orders.monthSales)}
            note={t('stMonthSalesD')}
          />
        </StatRow>
      </div>
    </div>
  );
}

/**
 * "Right now" (TENANT-DASHBOARD-DESIGN §7.1): products with the active count, low stock with the out count, the balance
 * with this cycle's free SMS, and the plan's or the trial's days left. Each tile only for whoever may see it (decided
 * 2026-10-23); low stock hidden while the shop has no products, and the days hidden on pay-as-you-go, which has none.
 */
export function NowTiles({ home }: { home: HomeView }): React.JSX.Element | null {
  const { t } = useTranslation('home');
  const { viewer, tenant } = useShell();
  const products = home.products;
  const stock = home.stock;
  const balance = home.balance;
  const noProducts = products?.total === 0;
  const left = daysUntil(tenant.periodEnd);
  const trial = tenant.state === TenantState.Trial;
  const showDays =
    allows(viewer, [Permission.PaymentsRead]) &&
    tenant.state !== TenantState.PayAsYouGo &&
    left !== null;

  const tiles = [
    products ? (
      <StatTile
        key="products"
        label={t('stProducts')}
        value={products.total}
        note={products.total > 0 ? t('activeN', { count: products.active }) : undefined}
      />
    ) : null,
    stock && !noProducts ? (
      <StatTile
        key="low"
        label={t('stLow')}
        value={stock.low + stock.out}
        note={stock.out > 0 ? t('outN', { count: stock.out }) : undefined}
        noteTone="bad"
      />
    ) : null,
    balance ? (
      <StatTile
        key="balance"
        label={t('stBalance')}
        value={
          <Taka amount={balance.amount} paisaClassName="text-[14px] font-medium text-fg-muted" />
        }
        note={
          balance.freeSms.used > 0 && balance.freeSms.limit !== null
            ? `${String(balance.freeSms.used)}/${String(balance.freeSms.limit)} SMS`
            : undefined
        }
      />
    ) : null,
    showDays ? (
      <StatTile
        key="days"
        label={trial ? t('trialDaysLeft') : t('stDays')}
        value={left}
        note={!trial && tenant.periodEnd ? formatDayMonth(tenant.periodEnd) : undefined}
      />
    ) : null,
  ].filter(Boolean);

  if (tiles.length === 0) return null;
  return (
    <div>
      <SectionHead>{t('nowTitle')}</SectionHead>
      <div className="mt-2">
        <StatRow label={t('nowTitle')}>{tiles}</StatRow>
      </div>
    </div>
  );
}
