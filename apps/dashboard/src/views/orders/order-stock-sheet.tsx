import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ORDERS_QUERY_KEY } from '@/api/orders';
import { useAddStock } from '@/api/stock';
import { ErrorBanner } from '@/components/error-banner';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useShell } from '@/shell/shell-context';
import type { Order, OrderItem } from '@/types/orders';
import { ItemChips } from './item-chips';

/** A typed amount, a whole or decimal number above zero. */
const AMOUNT = /^\d+(\.\d+)?$/;

/** INV-25 (ORDERS-BEYOND-STOCK OB-12): the order's first line still waiting for stock that can take stock here. */
export function firstShortItem(order: Order): OrderItem | null {
  return (
    order.items.find(
      (item) =>
        Number(item.short) > 0 &&
        item.components.length === 0 &&
        item.productId !== null &&
        item.variantId !== null,
    ) ?? null
  );
}

/**
 * Add stock from an order (ORDERS-BEYOND-STOCK OB-12, the sketch's `obs-add-stock`): the line's variant fixed, prefilled
 * with what it still waits for, recorded as new stock that arrived (INV-06). Older orders waiting for the same stock
 * are given it first (OB-8), so the sheet says so; the product's own page takes batches, serials and costs.
 */
export function OrderStockSheet({
  item,
  onClose,
  onAdded,
}: {
  item: OrderItem | null;
  onClose: () => void;
  /** Saved: how many waiting orders the stock went to (OB-10). */
  onAdded: (filledOrders: number) => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const { slug } = useShell();
  const queries = useQueryClient();
  const add = useAddStock(item?.productId ?? '');
  const [quantity, setQuantity] = useState('');

  useEffect(() => {
    if (item === null) return;
    setQuantity(String(Number(item.short)));
    add.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  const amount = quantity.trim();
  const valid = AMOUNT.test(amount) && Number(amount) > 0;

  function submit(): void {
    if (item?.variantId == null || !valid) return;
    add.mutate(
      { variantId: item.variantId, body: { quantity: Number(amount) } },
      {
        onSuccess: (stock) => {
          void queries.invalidateQueries({ queryKey: ORDERS_QUERY_KEY });
          onAdded(stock.filledOrders ?? 0);
        },
      },
    );
  }

  return (
    <Sheet
      open={item !== null}
      title={t('obs.addStock')}
      onClose={onClose}
      footer={
        <Button wide busy={add.isPending} disabled={!valid} onClick={submit}>
          {t('obs.addStock')}
        </Button>
      }
    >
      {item ? (
        <div className="flex flex-col gap-3">
          <div>
            <div className="mb-1.5 text-[16px] font-semibold [overflow-wrap:anywhere]">
              {item.productName}
            </div>
            <ItemChips item={item} />
          </div>
          <Field
            label={t('obs.quantity')}
            inputMode="decimal"
            className="num"
            value={quantity}
            onChange={(event) => {
              setQuantity(event.target.value);
            }}
          />
          <Banner tone="info">{t('obs.olderFirst')}</Banner>
          {add.isError ? (
            <>
              <ErrorBanner error={add.error} />
              {item.productId ? (
                <Link
                  to="/$shop/products/$productId"
                  params={{ shop: slug, productId: item.productId }}
                  className="text-[15px] font-semibold text-primary underline"
                >
                  {t('obs.openProduct')}
                </Link>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}

/**
 * OB-9 (the sketch's `obs-book-blocked`): booking, handing over or shipping an order still waiting for stock opens
 * this instead -- why it waits, with adding stock or cancelling the order.
 */
export function ShortBlockedSheet({
  open,
  canAdd,
  canCancel,
  onAdd,
  onCancel,
  onClose,
}: {
  open: boolean;
  canAdd: boolean;
  canCancel: boolean;
  onAdd: () => void;
  onCancel: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  return (
    <Sheet
      open={open}
      title={t('obs.blockedTitle')}
      onClose={onClose}
      footer={
        <div className="flex w-full flex-col gap-2">
          {canAdd ? (
            <Button wide onClick={onAdd}>
              {t('obs.addStock')}
            </Button>
          ) : null}
          {canCancel ? (
            <Button wide tone="outline" onClick={onCancel}>
              {t('obs.cancel')}
            </Button>
          ) : null}
        </div>
      }
    >
      {open ? <p className="text-[16px] leading-[1.5]">{t('obs.blockedBody')}</p> : null}
    </Sheet>
  );
}
