import { useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { CourierKey } from '@lytronix/validators';
import { useCourierKeyUses, useOperatorCouriers } from '@/api/couriers';
import { useShop } from '@/api/shops';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsolePage, PageTitle } from '@/components/ui/console-page';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { Pager } from '@/components/ui/pager';
import { StatusChip } from '@/components/ui/status-chip';
import { formatSessionTime } from '@/lib/session-time';
import type { CourierKeyUse } from '@/types/couriers';

const PER_PAGE = 20;

/** SEC-11 (OPERATOR-CONSOLE-DESIGN §5, v4): every call Lytro made with a shop's courier keys, never the keys themselves. */
export function ShopCourierKeys(): React.JSX.Element {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/_console/shops/$id/courier-keys' });
  const shop = useShop(id);
  const couriers = useOperatorCouriers();
  const [page, setPage] = useState(1);
  const uses = useCourierKeyUses(id, page, PER_PAGE);
  const nameOf = (key: CourierKey): string =>
    couriers.data?.find((each) => each.key === key)?.name ?? key;

  const columns: Column<CourierKeyUse>[] = [
    {
      key: 'when',
      label: t('shop.when'),
      width: '140px',
      main: true,
      cell: (use) => <span className="tabular-nums">{formatSessionTime(use.at)}</span>,
    },
    {
      key: 'courier',
      label: t('couriers.cCourier'),
      width: '100px',
      cell: (use) => nameOf(use.courierKey),
    },
    {
      key: 'action',
      label: t('shop.action'),
      width: 'minmax(200px,1.4fr)',
      cell: (use) => t(`courierActions.${use.action}`),
    },
    {
      key: 'order',
      label: t('couriers.cOrder'),
      width: '130px',
      cell: (use) =>
        use.orderNumber ? (
          <span className="tabular-nums">#{use.orderNumber}</span>
        ) : (
          <span className="text-fg-muted">{t('shop.none')}</span>
        ),
    },
    {
      key: 'result',
      label: t('shop.result'),
      width: '90px',
      cell: (use) =>
        use.succeeded ? (
          <StatusChip tone="ok">{t('shop.worked')}</StatusChip>
        ) : (
          <StatusChip tone="bad">{t('shop.failed')}</StatusChip>
        ),
    },
  ];

  return (
    <ConsolePage>
      <div className="flex items-center gap-1.5 text-[13px] text-fg-muted">
        <Link to="/shops" className="text-primary">
          {t('nav.shops')}
        </Link>
        <ConsoleIcon name="chev" />
        <Link to="/shops/$id" params={{ id }} className="min-w-0 truncate text-primary">
          {shop.data?.shopName}
        </Link>
        <ConsoleIcon name="chev" />
        <span>{t('courierKeys.title')}</span>
      </div>
      <PageTitle title={t('courierKeys.title')} lead={t('courierKeys.lead')} />
      {uses.isError ? (
        <LoadFailed
          onRetry={() => {
            void uses.refetch();
          }}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={uses.data?.uses ?? []}
          rowKey={(use) => `${use.at}-${use.action}-${use.orderId ?? ''}-${use.courierKey}`}
          loading={uses.isPending}
          empty={
            <EmptyBox
              icon="truck"
              title={t('courierKeys.empty')}
              hint={t('courierKeys.emptyHint')}
            />
          }
        />
      )}
      <Pager page={page} pages={uses.data?.pages ?? 1} onPage={setPage} />
    </ConsolePage>
  );
}
