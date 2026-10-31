import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission } from '@lytronix/validators';
import { useMarkLinkShared } from '@/api/home';
import {
  useOrderCount,
  useOrders,
  useOrdersById,
  type OrderFilter,
  type OrderTab,
} from '@/api/orders';
import { Icon } from '@/components/icon';
import { ActionBar } from '@/components/ui/action-bar';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchField } from '@/components/ui/search-field';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useErrorText } from '@/hooks/use-error-text';
import { useShopAddress } from '@/hooks/use-shop-address';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import { PrintSheet } from './labels';
import { DatesSheet, OrderRows, OrderTabs } from './order-list';
import { OrderDetail } from './order-page';
import { filterOf, searchOf, type OrdersSearch } from './order-search';

const TYPING_REST_MS = 250;

/**
 * Orders (TENANT-DASHBOARD-DESIGN §7.31, the prototype's `orders`, `order` and Part 29; ORD-13, ORD-41, ORD-52): the
 * search and the dates, the tabs with the day's work first, the rows under Today, Yesterday and Earlier, Show more
 * past 20. On a phone the list or the open order; from 1024 px the list with the open order beside it, the first one
 * when none is chosen.
 */
export function OrdersScreen({
  filter,
  orderId,
}: {
  filter: OrderFilter;
  orderId: string | null;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { slug, viewer } = useShell();
  const [typed, setTyped] = useState(filter.q ?? '');
  const [dating, setDating] = useState(false);
  // Part 29's `o29-select`: orders picked to print their labels, the only bulk action (agreed in the 4.8a read).
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [printing, setPrinting] = useState(false);
  const mayManage = allows(viewer, [Permission.OrdersManage]);
  const list = useOrders(filter);
  const everything = useOrderCount('all');
  const orders = (list.data?.pages ?? []).flatMap((page) => page.orders);
  const shown = orderId ?? orders[0]?.id ?? null;
  const none = everything.data === 0;
  const filtered = Boolean(filter.q?.trim() || filter.from || filter.to || filter.reason);

  // From the address as it is when the change lands, not as this render saw it: the search's pause must not undo the
  // dates chosen meanwhile.
  // The search's pause: a write of the search box still to come.
  const pending = useRef<number | null>(null);
  function show(next: Partial<OrderFilter>): void {
    // Each change carries the search box as it is and drops the pause's write still to come, so that write can never
    // land after the change from an address read before it (the dates lost to a cleared search, Slice 4.8a).
    if (pending.current !== null) window.clearTimeout(pending.current);
    pending.current = null;
    void navigate({
      to: orderId ? '/$shop/orders/$orderId' : '/$shop/orders',
      params: orderId ? { shop: slug, orderId } : { shop: slug },
      search: (previous) => searchOf({ ...filterOf(previous as OrdersSearch), q: typed, ...next }),
      replace: true,
    });
  }

  useEffect(() => {
    if (typed === (filter.q ?? '')) return;
    pending.current = window.setTimeout(() => {
      show({ q: typed });
    }, TYPING_REST_MS);
    return () => {
      if (pending.current !== null) window.clearTimeout(pending.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);

  const listColumn = none ? (
    <Card>
      <NoOrders mayEnter={mayManage} />
    </Card>
  ) : (
    <>
      {picked ? (
        <div className="flex min-h-11 items-center gap-2">
          <span className="flex-1 font-semibold">{t('selectedN', { count: picked.size })}</span>
          <Button
            tone="ghost"
            size="sm"
            onClick={() => {
              setPicked(null);
            }}
          >
            {t('cancel')}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <SearchField
            value={typed}
            onChange={setTyped}
            placeholder={t('searchPh')}
            label={t('searchPh')}
          />
          <button
            type="button"
            aria-label={t('dates')}
            aria-pressed={Boolean(filter.from || filter.to)}
            onClick={() => {
              setDating(true);
            }}
            className="flex size-11 flex-none items-center justify-center rounded-button border border-line-strong bg-surface text-neutral-700 aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-primary"
          >
            <Icon name="calendar" />
          </button>
          {mayManage ? (
            <button
              type="button"
              aria-label={t('select')}
              onClick={() => {
                setPicked(new Set());
              }}
              className="flex size-11 flex-none items-center justify-center rounded-button border border-line-strong bg-surface text-neutral-700"
            >
              <Icon name="printer" />
            </button>
          ) : null}
        </div>
      )}
      <OrderTabs
        filter={filter}
        onTab={(tab: OrderTab, reason) => {
          show({ tab, reason });
        }}
      />
      {list.isError ? <Banner tone="bad">{errorText(list.error)}</Banner> : null}
      <Card flush>
        {list.isPending ? (
          <SkeletonRows count={4} />
        ) : orders.length === 0 ? (
          <p className="flex min-h-16 items-center px-4 text-[14px] text-fg-muted">
            {filtered ? t('noneMatch') : t('noneHere')}
          </p>
        ) : (
          <OrderRows
            orders={orders}
            selected={picked ? null : shown}
            search={searchOf(filter)}
            picking={
              picked
                ? {
                    picked,
                    onToggle: (id) => {
                      const next = new Set(picked);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      setPicked(next);
                    },
                  }
                : null
            }
          />
        )}
      </Card>
      {list.hasNextPage ? (
        <Button
          tone="outline"
          wide
          busy={list.isFetchingNextPage}
          onClick={() => {
            void list.fetchNextPage();
          }}
        >
          {t('showMore')}
        </Button>
      ) : null}
      {picked ? (
        <ActionBar>
          <Button
            disabled={picked.size === 0}
            onClick={() => {
              setPrinting(true);
            }}
          >
            <Icon name="printer" />
            {t('printN', { count: picked.size })}
          </Button>
        </ActionBar>
      ) : null}
      {printing && picked ? (
        <PrintPicked
          ids={[...picked]}
          onClose={() => {
            setPrinting(false);
          }}
        />
      ) : null}
      <DatesSheet
        key={`${filter.from ?? ''}-${filter.to ?? ''}`}
        open={dating}
        filter={filter}
        onShow={(from, to) => {
          setDating(false);
          show({ from, to });
        }}
        onClose={() => {
          setDating(false);
        }}
      />
    </>
  );

  return (
    <ShellPage
      title={orderId ? null : undefined}
      actions={
        mayManage ? (
          <Link
            to="/$shop/orders/new"
            params={{ shop: slug }}
            className={buttonClass('primary', 'sm')}
          >
            <Icon name="plus" />
            {t('newOrder')}
          </Link>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        <div
          className={`flex min-w-0 flex-col gap-4 lg:w-[400px] lg:flex-none ${orderId ? 'max-lg:hidden' : ''}`}
        >
          {listColumn}
        </div>
        <div
          className={`min-w-0 flex-1 flex-col gap-4 lg:gap-6 ${orderId ? 'flex' : 'hidden lg:flex'}`}
        >
          {shown ? <OrderDetail key={shown} orderId={shown} /> : null}
        </div>
      </div>
    </ShellPage>
  );
}

/** The picked orders' labels, each order read in full first (Part 29's `o29-select` to `o29-print`). */
function PrintPicked({ ids, onClose }: { ids: string[]; onClose: () => void }): React.JSX.Element {
  const found = useOrdersById(ids);
  const orders = found.flatMap((each) => (each.data ? [each.data] : []));
  return (
    <PrintSheet orders={orders} loading={found.some((each) => each.isPending)} onClose={onClose} />
  );
}

/** No orders yet (Part 29's `o29-empty`): share the shop's link, or enter one taken on the phone. */
function NoOrders({ mayEnter }: { mayEnter: boolean }): React.JSX.Element {
  const { t } = useTranslation('orders');
  const { slug, showToast } = useShell();
  const shared = useMarkLinkShared();
  const { url } = useShopAddress();

  const share = async (): Promise<void> => {
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ url });
      } else {
        await navigator.clipboard.writeText(url);
        showToast(t('copied'));
      }
      shared.mutate();
    } catch {
      // The person closed the share sheet, or the clipboard is blocked: nothing was shared.
    }
  };

  return (
    <EmptyState
      icon="orders"
      action={
        // The prototype's `.actions`, centred: the two ways in side by side.
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              void share();
            }}
          >
            {t('shareLink')}
          </Button>
          {mayEnter ? (
            <Link
              to="/$shop/orders/new"
              params={{ shop: slug }}
              className={buttonClass('outline', 'sm')}
            >
              {t('enterOrder')}
            </Link>
          ) : null}
        </div>
      }
    >
      {t('empty')}
    </EmptyState>
  );
}
