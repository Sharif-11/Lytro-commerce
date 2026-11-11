import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { phoneSearchOf, TenantSort, TenantState } from '@lytronix/validators';
import { usePlans } from '@/api/plans';
import { useSearchShops } from '@/api/shops';
import { Banner } from '@/components/ui/banner';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsolePage, PageTitle } from '@/components/ui/console-page';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { CELL_NOTE, SMALL_BUTTON } from '@/components/ui/sizes';
import { StatusChip } from '@/components/ui/status-chip';
import { enumValue } from '@/lib/enum-value';
import { daysFromNow, formatDay } from '@/lib/format';
import { spacedPhone } from '@/lib/phone-words';
import type { TenantSummary } from '@/types/operator';
import { FilterRow, FilterSelect } from './filter-select';
import { ShopStateChip } from './shop-state-chip';

const SEARCH_DEBOUNCE_MS = 300;

/** Every state a shop can be in, in its life's order, for the State filter. */
const STATES: TenantState[] = [
  TenantState.Trial,
  TenantState.PayAsYouGo,
  TenantState.Active,
  TenantState.Grace,
  TenantState.ReadOnly,
  TenantState.Locked,
  TenantState.Archived,
  TenantState.Deleted,
];

const SORTS: { value: TenantSort; labelKey: string }[] = [
  { value: TenantSort.Newest, labelKey: 'p88shops.sortNewest' },
  { value: TenantSort.Name, labelKey: 'p88shops.sortName' },
  { value: TenantSort.PeriodEnd, labelKey: 'p88shops.sortPeriod' },
];

/**
 * OPERATOR-CONSOLE-DESIGN §5 (v7): every shop, found by name, address or the owner's phone (D8-24), narrowed by state and
 * plan and put in one of three orders (ADM-02, D8-7); what to do with one is on its own page.
 */
export function Shops(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { q, state, planId, sort } = useSearch({ from: '/_console/shops/' });
  const sent = q ?? '';
  const [typed, setTyped] = useState(sent);
  const shops = useSearchShops(sent, { state, planId, sort });
  const plans = usePlans();
  const byPhone = sent !== '' && phoneSearchOf(sent) !== null;

  // The top bar's search can send another word while this screen is open.
  useEffect(() => {
    setTyped(sent);
  }, [sent]);

  useEffect(() => {
    const word = typed.trim();
    if (word === sent) return undefined;
    const handle = window.setTimeout(() => {
      void navigate({
        to: '/shops',
        search: (prior) => ({ ...prior, q: word || undefined }),
        replace: true,
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(handle);
    };
  }, [typed, sent, navigate]);

  const rows = shops.data?.pages.flatMap((page) => page.entries) ?? [];

  function filter(change: { state?: TenantState; planId?: string; sort?: TenantSort }): void {
    void navigate({ to: '/shops', search: (prior) => ({ ...prior, ...change }), replace: true });
  }

  const columns: Column<TenantSummary>[] = [
    {
      key: 'shop',
      label: t('queue.shop'),
      width: 'minmax(150px,1.4fr)',
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
          {shop.suspendedAt ? (
            <div className="mt-1">
              <StatusChip tone="bad">{t('shop.suspended')}</StatusChip>
            </div>
          ) : shop.overrideCount > 0 ? (
            <div className="mt-1">
              <StatusChip tone="mute" plain>
                {shop.overrideCount} {t('shop.overrides').toLowerCase()}
              </StatusChip>
            </div>
          ) : null}
        </>
      ),
    },
    {
      key: 'owner',
      label: t('p88shops.ownerPhone'),
      width: '118px',
      cell: (shop) => (
        <span className="mono text-[13px]">
          {shop.ownerPhone ? spacedPhone(shop.ownerPhone) : '—'}
        </span>
      ),
    },
    {
      key: 'state',
      label: t('shops.state'),
      width: '116px',
      cell: (shop) => <ShopStateChip state={shop.state} />,
    },
    {
      key: 'plan',
      label: t('shops.plan'),
      width: '100px',
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
      width: '120px',
      cell: (shop) => {
        if (!shop.periodEnd) return <span className="text-fg-muted">{t('p88shops.noPeriod')}</span>;
        const days = daysFromNow(shop.periodEnd);
        return (
          <>
            <span className="tabular-nums">{formatDay(shop.periodEnd)}</span>
            <div className={`text-[12px] ${days < 0 ? 'text-danger' : 'text-fg-muted'}`}>
              {days >= 0 ? '+' : ''}
              {days}d
            </div>
          </>
        );
      },
    },
    {
      key: 'actions',
      label: '',
      width: '60px',
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
        <span className="ml-auto rounded border border-b-2 border-line-strong bg-surface px-[5px] py-px font-mono text-[11px] text-neutral-700">
          /
        </span>
      </div>
      <FilterRow>
        <FilterSelect
          label={t('p88shops.filterState')}
          value={state ?? ''}
          onChange={(value) => {
            filter({
              state: value === '' ? undefined : enumValue(STATES, value, TenantState.Active),
            });
          }}
        >
          <option value="">{t('p88shops.allStates')}</option>
          {STATES.map((each) => (
            <option key={each} value={each}>
              {t(`states.${each}`)}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label={t('p88shops.filterPlan')}
          value={planId ?? ''}
          onChange={(value) => {
            filter({ planId: value === '' ? undefined : value });
          }}
        >
          <option value="">{t('p88shops.allPlans')}</option>
          {(plans.data ?? []).map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label={t('p88shops.filterSort')}
          value={sort ?? TenantSort.Newest}
          wide
          onChange={(value) => {
            const chosen = enumValue(Object.values(TenantSort), value, TenantSort.Newest);
            filter({ sort: chosen === TenantSort.Newest ? undefined : chosen });
          }}
        >
          {SORTS.map((each) => (
            <option key={each.value} value={each.value}>
              {t(each.labelKey)}
            </option>
          ))}
        </FilterSelect>
      </FilterRow>
      {byPhone && rows.length > 0 ? (
        <Banner tone="info" icon="phone">
          {t('p88shops.phoneHint')}
        </Banner>
      ) : null}
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
