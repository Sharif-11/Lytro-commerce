import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { useSearchShops } from '@/api/shops';
import { Chip } from '@/components/ui/chips';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsolePage, PageTitle } from '@/components/ui/console-page';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { CELL_NOTE, SMALL_BUTTON } from '@/components/ui/sizes';
import { StatusChip } from '@/components/ui/status-chip';
import { daysFromNow, formatDay } from '@/lib/format';
import type { TenantSummary } from '@/types/operator';
import { ShopStateChip } from './shop-state-chip';

const SEARCH_DEBOUNCE_MS = 300;

/** OPERATOR-CONSOLE-DESIGN §5: every shop, found by name or address; what to do with one is on its own page. */
export function Shops(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { q } = useSearch({ from: '/_console/shops/' });
  const sent = q ?? '';
  const [typed, setTyped] = useState(sent);
  const shops = useSearchShops(sent);

  // The top bar's search can send another word while this screen is open.
  useEffect(() => {
    setTyped(sent);
  }, [sent]);

  useEffect(() => {
    const word = typed.trim();
    if (word === sent) return undefined;
    const handle = window.setTimeout(() => {
      void navigate({ to: '/shops', search: word ? { q: word } : {}, replace: true });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(handle);
    };
  }, [typed, sent, navigate]);

  const rows = shops.data?.pages.flatMap((page) => page.entries) ?? [];

  const columns: Column<TenantSummary>[] = [
    {
      key: 'shop',
      label: t('queue.shop'),
      width: 'minmax(200px,1.6fr)',
      main: true,
      cell: (shop) => (
        <>
          <Link
            to="/shops/$id"
            params={{ id: shop.id }}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            {shop.shopName}
          </Link>
          <div className={CELL_NOTE}>{shop.slug}.lytro.app</div>
        </>
      ),
    },
    {
      key: 'state',
      label: t('shops.state'),
      width: '150px',
      cell: (shop) => <ShopStateChip state={shop.state} />,
    },
    {
      key: 'plan',
      label: t('shops.plan'),
      width: '140px',
      cell: (shop) => (
        <>
          {shop.planName ?? '—'}{' '}
          {shop.planVersion === null ? null : (
            <span className="text-fg-muted">v{shop.planVersion}</span>
          )}
        </>
      ),
    },
    {
      key: 'period',
      label: t('shops.period'),
      width: '170px',
      cell: (shop) => {
        if (!shop.periodEnd) return '—';
        const days = daysFromNow(shop.periodEnd);
        return (
          <>
            <span className="tabular-nums">{formatDay(shop.periodEnd)}</span>{' '}
            <span className={`text-[12px] ${days < 0 ? 'text-danger' : 'text-fg-muted'}`}>
              {days >= 0 ? '+' : ''}
              {days}d
            </span>
          </>
        );
      },
    },
    {
      key: 'flags',
      label: '',
      width: '120px',
      cell: (shop) => {
        if (shop.suspendedAt) return <StatusChip tone="bad">{t('shop.suspended')}</StatusChip>;
        if (shop.overrideCount > 0) {
          return (
            <StatusChip tone="mute" plain>
              {shop.overrideCount} {t('shop.overrides').toLowerCase()}
            </StatusChip>
          );
        }
        return null;
      },
    },
    {
      key: 'actions',
      label: '',
      width: '80px',
      actions: true,
      cell: (shop) => (
        <Button
          type="button"
          tone="outline"
          small
          fit
          className={SMALL_BUTTON}
          onClick={(event) => {
            event.stopPropagation();
            void navigate({ to: '/shops/$id', params: { id: shop.id } });
          }}
        >
          {t('shops.open')}
        </Button>
      ),
    },
  ];

  return (
    <ConsolePage>
      <PageTitle title={t('nav.shops')} lead={t('shops.lead')} />
      <div className="flex h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-fg-subtle focus-within:border-line-active focus-within:ring-2 focus-within:ring-field-ring">
        <ConsoleIcon name="search" />
        <input
          type="search"
          aria-label={t('shell.search')}
          placeholder={t('shell.search')}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
          }}
          className="min-w-0 flex-1 bg-transparent text-input text-ink outline-none placeholder:text-placeholder"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip>
          {t('shops.state')}: {t('shops.all')}
        </Chip>
        <Chip>
          {t('shops.plan')}: {t('shops.all')}
        </Chip>
        <span className="text-[13px] leading-[1.55] text-fg-muted">{t('shops.filtersLater')}</span>
      </div>
      {shops.isError ? (
        <LoadFailed
          onRetry={() => {
            void shops.refetch();
          }}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(shop) => shop.id}
          loading={shops.isPending}
          onOpen={(shop) => {
            void navigate({ to: '/shops/$id', params: { id: shop.id } });
          }}
          empty={<EmptyBox icon="store" title={t('shops.empty')} hint={t('shops.emptyHint')} />}
        />
      )}
      {shops.hasNextPage ? (
        <div className="text-center">
          <Button
            type="button"
            tone="outline"
            small
            fit
            loading={shops.isFetchingNextPage}
            onClick={() => {
              void shops.fetchNextPage();
            }}
          >
            {t('shops.loadMore')}
          </Button>
        </div>
      ) : null}
    </ConsolePage>
  );
}
