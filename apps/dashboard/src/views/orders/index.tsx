import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useMarkLinkShared } from '@/api/home';
import { useOrderCount, useOrders, type OrderFilter, type OrderTab } from '@/api/orders';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchField } from '@/components/ui/search-field';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useErrorText } from '@/hooks/use-error-text';
import { useShopAddress } from '@/hooks/use-shop-address';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import { DatesSheet, OrderRows, OrderTabs } from './order-list';
import { OrderDetail } from './order-page';
import { searchOf } from './order-search';

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
  const { slug } = useShell();
  const [typed, setTyped] = useState(filter.q ?? '');
  const [dating, setDating] = useState(false);
  const list = useOrders(filter);
  const everything = useOrderCount('all');
  const orders = (list.data?.pages ?? []).flatMap((page) => page.orders);
  const shown = orderId ?? orders[0]?.id ?? null;
  const none = everything.data === 0;
  const filtered = Boolean(filter.q?.trim() || filter.from || filter.to || filter.reason);

  function show(next: Partial<OrderFilter>): void {
    void navigate({
      to: orderId ? '/$shop/orders/$orderId' : '/$shop/orders',
      params: orderId ? { shop: slug, orderId } : { shop: slug },
      search: searchOf({ ...filter, ...next }),
      replace: true,
    });
  }

  useEffect(() => {
    if (typed === (filter.q ?? '')) return;
    const timer = window.setTimeout(() => {
      show({ q: typed });
    }, TYPING_REST_MS);
    return () => {
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);

  const listColumn = none ? (
    <Card>
      <NoOrders />
    </Card>
  ) : (
    <>
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
      </div>
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
          <OrderRows orders={orders} selected={shown} search={searchOf(filter)} />
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
    <ShellPage title={orderId ? null : undefined}>
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

/** No orders yet (Part 29's `o29-empty`): share the shop's link. */
function NoOrders(): React.JSX.Element {
  const { t } = useTranslation('orders');
  const { showToast } = useShell();
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
        <Button
          size="sm"
          onClick={() => {
            void share();
          }}
        >
          {t('shareLink')}
        </Button>
      }
    >
      {t('empty')}
    </EmptyState>
  );
}
