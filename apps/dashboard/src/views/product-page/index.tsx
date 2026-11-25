import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  Permission,
  ProductKind,
  SalesBucket,
  StockState,
  StockTracking,
} from '@lytronix/validators';
import { formatTakaExact } from '@lytronix/ui';
import { ApiClientError } from '@lytronix/api-client';
import { useProductStock } from '@/api/attributes';
import { useProductOrders } from '@/api/orders';
import { useDuplicateProduct, useProduct, useRemoveProduct } from '@/api/products';
import { useSales } from '@/api/sales';
import { Icon } from '@/components/icon';
import { ProductShareSheet } from '@/components/product-share/product-share';
import { ActionBar } from '@/components/ui/action-bar';
import { Button } from '@/components/ui/button';
import { buttonClass } from '@/components/ui/classes';
import { Card } from '@/components/ui/card';
import { RowList, rowClass } from '@/components/ui/list-row';
import { Sheet } from '@/components/ui/sheet';
import { StatusTag } from '@/components/ui/status-tag';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { useErrorText } from '@/hooks/use-error-text';
import { useShopAddress } from '@/hooks/use-shop-address';
import { todayInputValue } from '@/lib/dates';
import { bangladeshiPhone } from '@/lib/phone';
import { linkOf } from '@/lib/product-link';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import type { ProductStock, VariantStock } from '@/types/attribute';
import type { ProductDetail } from '@/types/product';
import { useOrderWords } from '@/views/orders/order-words';
import { useCategoryName } from '@/views/products/product-words';
import { ArchivedProduct } from '@/views/product/archived-product';
import { InCombosDialog } from '@/views/product/in-combos-dialog';
import { combosIn } from '@/views/product/in-combos';
import { RemoveDialog } from '@/views/product/remove-dialog';
import { StockCard, StockSheets, type StockSheet } from '@/views/product/stock-card';
import { useAmountText } from '@/views/product/stock-holders';
import type { StockKind } from '@/views/product/variants-card';

/** A video's length as the sketch writes it: "0:24". */
function lengthOf(durationMs: number): string {
  const seconds = Math.round(durationMs / 1000);
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;
}

/** The 30 days to today (Asia/Dhaka) the page's sales figures cover. */
function lastThirtyDays(): { from: string; to: string } {
  const to = todayInputValue();
  const start = new Date(`${to}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 29);
  return { from: start.toISOString().slice(0, 10), to };
}

/**
 * The seller's product page (TENANT-DASHBOARD-DESIGN §7.4c, the sketch's `pd-*`; the owner, 2026-11-25: "the correct flow
 * is product detail page for seller with button for editing, deleting etc, sharing etc"): a read view of one product --
 * its photos and video, name, status and price; its stock (the built Stock card, or each design's count by size); its
 * newest orders; its link; its last 30 days; and Edit, Share and more (see in the shop, duplicate, archive, delete). An
 * archived product shows its archived page as built.
 */
export function ProductPage({ productId }: { productId: string }): React.JSX.Element {
  const { t } = useTranslation('shop');
  const { t: shell } = useTranslation('shell');
  const product = useProduct(productId);
  if (product.isError) {
    return <p className="text-[15px] text-fg-muted">{t('notFound')}</p>;
  }
  if (!product.data) return <p className="text-[15px] text-fg-muted">{shell('loading')}</p>;
  if (product.data.archived) return <ArchivedProduct product={product.data} />;
  return <ProductView product={product.data} />;
}

function ProductView({ product }: { product: ProductDetail }): React.JSX.Element {
  const { t } = useTranslation('shop');
  const { t: shell } = useTranslation('shell');
  const categoryName = useCategoryName();
  const amount = useAmountText();
  const navigate = useNavigate();
  const errorText = useErrorText();
  const { slug, viewer, showToast } = useShell();
  const { host } = useShopAddress();
  const mayManage = allows(viewer, [Permission.ProductsManage]);
  const mayReadStock = allows(viewer, [Permission.InventoryRead]);
  const mayManageStock = allows(viewer, [Permission.InventoryManage]);
  const mayReadOrders = allows(viewer, [Permission.OrdersRead]);
  const stock = useProductStock(product.id, { enabled: mayReadStock });
  const recent = useProductOrders(product.id, { enabled: mayReadOrders });
  const sales = useSales(
    { ...lastThirtyDays(), bucket: SalesBucket.Month, productId: product.id },
    { enabled: mayReadOrders },
  );
  const duplicate = useDuplicateProduct(product.id);
  const remove = useRemoveProduct(product.id);
  const [sharing, setSharing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [removing, setRemoving] = useState<'archive' | 'hard' | null>(null);
  const [stockSheet, setStockSheet] = useState<StockSheet | null>(null);
  const { copied, copy } = useCopyToClipboard(1600);
  const inCombos = combosIn(remove.error);
  const combo = product.kind === ProductKind.Combo;
  const kind: StockKind = {
    tracked: product.stockTracking === StockTracking.Tracked,
    batch: product.batchTracked,
    serial: product.serialTracked,
    format: product.serialFormat,
    unit: product.stockUnit,
  };
  const shown = linkOf(host, product, null);
  const url = `https://${shown}`;
  const share = (): void => {
    setMenu(false);
    setSharing(true);
  };
  const edit = (
    <Link
      to="/$shop/products/$productId/edit"
      params={{ shop: slug, productId: product.id }}
      className={`${buttonClass('primary', 'md')} flex-1 justify-center no-underline`}
    >
      <Icon name="pencil" />
      {t('ppEdit')}
    </Link>
  );
  const shareButton = (
    <Button tone="outline" onClick={share}>
      <Icon name="share" />
      {t('ppShare')}
    </Button>
  );
  const moreButton = (
    <Button
      tone="outline"
      aria-label={t('ppMore')}
      onClick={() => {
        setMenu(true);
      }}
    >
      <Icon name="more" />
    </Button>
  );

  const photos = product.images;
  const designOf = (imageId: string): number | null =>
    product.designs.find((each) => each.photoIds.includes(imageId))?.number ?? null;
  const tracked = !combo && kind.tracked && mayReadStock;
  // pd-detail-designs: each design's count by size in place of the Stock card, when the designs hold their own stock.
  const grid =
    tracked && product.designs.length > 1 && stock.data !== undefined && stock.data.shared === null;
  const category = categoryName(product.primaryCategoryId);
  const sold = sales.data?.totals.units[0];

  return (
    <div className="flex flex-col gap-section pb-2">
      {mayManage ? (
        <div className="hidden justify-end gap-2 lg:flex">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${buttonClass('outline', 'md')} no-underline`}
          >
            <Icon name="external" />
            {t('ppSeeInShop')}
          </a>
          {shareButton}
          {moreButton}
          <Link
            to="/$shop/products/$productId/edit"
            params={{ shop: slug, productId: product.id }}
            className={`${buttonClass('primary', 'md')} no-underline`}
          >
            <Icon name="pencil" />
            {t('ppEdit')}
          </Link>
        </div>
      ) : null}
      <div className="grid gap-section lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-section">
          {photos.length > 0 || product.video ? (
            <div
              className="-mx-4 flex gap-2.5 overflow-x-auto px-4 lg:mx-0 lg:px-0"
              data-testid="pd-photos"
            >
              {photos.map((image, at) => {
                const design = designOf(image.id);
                return (
                  <span key={image.id} className="flex w-24 flex-none flex-col gap-1.5">
                    <img
                      src={image.urls.thumbnail}
                      alt=""
                      className="h-30 w-24 rounded-[10px] bg-neutral-100 object-cover"
                    />
                    <span className="text-[13px] text-fg-muted">
                      {design !== null
                        ? t('psDesignN', { n: design })
                        : at === 0
                          ? t('ppFirstPhoto')
                          : t('ppPhotoN', { n: at + 1 })}
                    </span>
                  </span>
                );
              })}
              {product.video ? (
                <span className="relative flex w-24 flex-none flex-col gap-1.5">
                  <img
                    src={product.video.urls.poster}
                    alt=""
                    className="h-30 w-24 rounded-[10px] bg-neutral-100 object-cover brightness-80"
                  />
                  <span
                    aria-hidden="true"
                    className="absolute top-[46px] left-[34px] grid size-7 place-items-center rounded-full bg-black/55 text-white"
                  >
                    <Icon name="play" size={14} />
                  </span>
                  <span className="text-[13px] text-fg-muted">
                    {product.video.durationMs === null
                      ? t('ppVideo')
                      : t('ppVideoLength', { length: lengthOf(product.video.durationMs) })}
                  </span>
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-[22px] font-semibold">{product.name}</h1>
              <StatusTag tone={product.active ? 'ok' : 'neutral'}>
                {product.active ? t('active') : t('inactive')}
              </StatusTag>
            </div>
            <p className="flex items-baseline gap-2.5">
              <b className="num text-[22px] font-bold">{formatTakaExact(product.basePrice)}</b>
              <span className="text-[14px] text-fg-muted">
                {[category, kind.tracked || combo ? null : t('ppMadeToOrder')]
                  .filter((each) => each !== null)
                  .join(' · ')}
              </span>
            </p>
          </div>
          {!combo && !kind.tracked ? (
            <Card>
              <h2 className="text-[17px] font-semibold">{t('stockCardTitle')}</h2>
              <p className="mt-1 flex items-start gap-2 text-[15px] text-fg-muted">
                <Icon name="box" size={18} />
                {t('ppMadeNote')}
              </p>
            </Card>
          ) : null}
          {grid ? (
            <DesignGrid
              product={product}
              stock={stock.data}
              onAdd={
                mayManageStock
                  ? () => {
                      setStockSheet({ kind: 'add', variantId: null });
                    }
                  : null
              }
            />
          ) : tracked ? (
            <StockCard
              product={product}
              stock={stock.data}
              kind={kind}
              mayManage={mayManageStock}
              onOpen={setStockSheet}
            />
          ) : null}
          {mayReadOrders ? (
            <Card flush>
              <div className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-1">
                <h2 className="text-[17px] font-semibold">{t('ppRecent')}</h2>
                <Link
                  to="/$shop/orders"
                  params={{ shop: slug }}
                  search={{ tab: 'all', product: product.id, productName: product.name }}
                  className="inline-flex items-center gap-1 text-[14px] font-medium text-primary no-underline"
                >
                  {t('ppSeeAll')}
                  <Icon name="right" size={16} />
                </Link>
              </div>
              {recent.data && recent.data.orders.length > 0 ? (
                <RowList>
                  {recent.data.orders.map((order) => (
                    <RecentOrder
                      key={order.id}
                      order={order}
                      cover={photos[0]?.urls.thumbnail ?? null}
                    />
                  ))}
                </RowList>
              ) : (
                <p className="px-4 pb-4 text-[15px] text-fg-muted">
                  {recent.isLoading ? shell('loading') : t('ppNoOrders')}
                </p>
              )}
            </Card>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-section">
          <Card>
            <h2 className="text-[17px] font-semibold">{t('productLink')}</h2>
            <div className="mt-2 flex h-12 items-center rounded-control border border-line-strong bg-surface px-3 text-[16px]">
              <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                {shown}
              </span>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button
                tone="outline"
                size="sm"
                onClick={() => {
                  void copy(url).then((ok) => {
                    if (ok) showToast(t('psCopiedToast'));
                  });
                }}
              >
                <Icon name={copied ? 'check' : 'copy'} />
                {copied ? t('psCopied') : t('ppCopy')}
              </Button>
              <Button tone="outline" size="sm" onClick={share}>
                <Icon name="share" />
                {t('ppShare')}
              </Button>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={`${buttonClass('outline', 'sm')} no-underline`}
              >
                <Icon name="external" />
                {t('ppSee')}
              </a>
            </div>
          </Card>
          {mayReadOrders ? (
            <Card>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[17px] font-semibold">{t('ppLast30')}</h2>
                <Link
                  to="/$shop/sales/$productId"
                  params={{ shop: slug, productId: product.id }}
                  search={{ name: product.name }}
                  className="inline-flex items-center gap-1 text-[14px] font-medium text-primary no-underline"
                >
                  {t('ppSeeSales')}
                  <Icon name="right" size={16} />
                </Link>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2" data-testid="pd-sales">
                <Figure
                  value={amount(sold?.quantity ?? '0', sold?.unit ?? 'piece')}
                  label={(sold?.unit ?? 'piece') === 'piece' ? t('ppUnitsSold') : t('ppAmountSold')}
                />
                <Figure
                  value={formatTakaExact(sales.data?.totals.revenue ?? '0')}
                  label={t('ppSales')}
                />
                <Figure value={String(sales.data?.totals.orders ?? 0)} label={t('ppOrders')} />
              </div>
            </Card>
          ) : null}
          {tracked ? (
            <Card flush>
              <RowList>
                <button
                  type="button"
                  className={rowClass}
                  onClick={() => {
                    setStockSheet({ kind: kind.batch ? 'batches' : 'history', variantId: null });
                  }}
                >
                  <Icon name="list" />
                  <span className="flex min-w-0 flex-1 flex-col text-left">
                    <span className="text-[16px] font-medium">
                      {kind.batch ? t('batchesTitle') : t('historyBtn')}
                    </span>
                    <span className="text-[14px] text-fg-muted">{t('ppHistoryNote')}</span>
                  </span>
                  <Icon name="right" />
                </button>
              </RowList>
            </Card>
          ) : null}
        </div>
      </div>
      {mayManage ? (
        <div className="lg:hidden">
          <ActionBar>
            {edit}
            {shareButton}
            {moreButton}
          </ActionBar>
        </div>
      ) : null}
      <ProductShareSheet
        productId={sharing ? product.id : null}
        onClose={() => {
          setSharing(false);
        }}
      />
      <Sheet
        open={menu}
        title={product.name}
        onClose={() => {
          setMenu(false);
        }}
      >
        <RowList>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${rowClass} no-underline`}
          >
            <Icon name="external" />
            <span className="text-[16px] font-medium">{t('ppSeeInShop')}</span>
          </a>
          <button
            type="button"
            className={rowClass}
            disabled={duplicate.isPending}
            onClick={() => {
              duplicate.mutate(undefined, {
                onSuccess: (made) => {
                  setMenu(false);
                  showToast(t('peCopied'));
                  // The sketch's menu: "a copy of this product, opened to edit".
                  void navigate({
                    to: '/$shop/products/$productId/edit',
                    params: { shop: slug, productId: made.id },
                  });
                },
                onError: (error) => {
                  setMenu(false);
                  showToast(error instanceof ApiClientError ? errorText(error) : t('ppCopyFailed'));
                },
              });
            }}
          >
            <Icon name="copy" />
            <span className="flex flex-col text-left">
              <span className="text-[16px] font-medium">{t('duplicate')}</span>
              <span className="text-[14px] text-fg-muted">{t('ppDuplicateNote')}</span>
            </span>
          </button>
          <button
            type="button"
            className={rowClass}
            onClick={() => {
              setMenu(false);
              setRemoving('archive');
            }}
          >
            <Icon name="box" />
            <span className="flex flex-col text-left">
              <span className="text-[16px] font-medium">{t('archiveOpt')}</span>
              <span className="text-[14px] text-fg-muted">{t('archiveNote')}</span>
            </span>
          </button>
          <button
            type="button"
            className={rowClass}
            onClick={() => {
              setMenu(false);
              setRemoving('hard');
            }}
          >
            <span className="text-danger">
              <Icon name="trash" />
            </span>
            <span className="text-[16px] font-medium text-danger">{t('ppDelete')}</span>
          </button>
        </RowList>
      </Sheet>
      <RemoveDialog
        open={inCombos.length > 0 ? null : removing}
        busy={remove.isPending}
        onClose={() => {
          setRemoving(null);
        }}
        onRemove={(hard) => {
          remove.mutate(hard, {
            onSuccess: () => {
              setRemoving(null);
              showToast(t(hard ? 'peDeletedToast' : 'peArchivedToast', { name: product.name }));
              void navigate({ to: '/$shop/products', params: { shop: slug } });
            },
          });
        }}
        error={remove.isError ? errorText(remove.error) : null}
      />
      {inCombos.length > 0 ? (
        <InCombosDialog
          name={product.name}
          combos={inCombos}
          onClose={() => {
            remove.reset();
            setRemoving(null);
          }}
        />
      ) : null}
      <StockSheets
        sheet={stockSheet}
        product={product}
        stock={stock.data}
        kind={kind}
        mayManage={mayManageStock}
        onSheet={setStockSheet}
      />
    </div>
  );
}

function Figure({ value, label }: { value: string; label: string }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5 rounded-[10px] bg-neutral-50 p-2.5">
      <b className="num text-[18px] font-bold">{value}</b>
      <span className="text-[13px] text-fg-muted">{label}</span>
    </div>
  );
}

/** One of the product's newest orders, in the new row style: the photo, name, phone (its digits together), total, status. */
function RecentOrder({
  order,
  cover,
}: {
  order: {
    id: string;
    customerName: string | null;
    customerPhone: string | null;
    grandTotal: string;
    status: Parameters<ReturnType<typeof useOrderWords>['status']>[0];
  };
  cover: string | null;
}): React.JSX.Element {
  const { slug } = useShell();
  const words = useOrderWords();
  const shown = words.status(order.status);
  return (
    <Link
      to="/$shop/orders/$orderId"
      params={{ shop: slug, orderId: order.id }}
      className={`${rowClass} no-underline`}
    >
      <span className="size-11 flex-none overflow-hidden rounded-[8px] bg-neutral-100">
        {cover ? <img src={cover} alt="" className="size-full object-cover" /> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[16px] font-medium">{order.customerName ?? '—'}</span>
        <span className="num text-[14px] text-fg-muted">
          {order.customerPhone ? bangladeshiPhone.forField(order.customerPhone) : ''}
        </span>
      </span>
      <span className="flex flex-none flex-col items-end gap-1">
        <span className="num text-[16px] font-semibold">{formatTakaExact(order.grandTotal)}</span>
        <StatusTag tone={shown.tone}>{shown.word}</StatusTag>
      </span>
    </Link>
  );
}

/** Each design's count by size (the sketch's `pd-detail-designs`): sold-out cells red, low ones amber. */
function DesignGrid({
  product,
  stock,
  onAdd,
}: {
  product: ProductDetail;
  stock: ProductStock;
  onAdd: (() => void) | null;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const designIds = new Set(product.designs.map((each) => each.id));
  const sizes = product.variantAttributes.find(
    (attribute) => !attribute.options.some((option) => designIds.has(option.id)),
  );
  const keyOf = (optionIds: readonly string[]): string => optionIds.slice().sort().join(' ');
  const cells = new Map(
    stock.variants
      .filter((each) => !each.retired)
      .map((each) => [keyOf(each.optionIds), each] as const),
  );
  const cellOf = (designId: string, sizeId: string | null): VariantStock | null =>
    cells.get(keyOf(sizeId ? [designId, sizeId] : [designId])) ?? null;
  const columns = sizes ? sizes.options : [null];
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-semibold">{t('stockCardTitle')}</h2>
        {onAdd ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-1 text-[14px] font-medium text-primary"
            onClick={onAdd}
          >
            <Icon name="plus" size={16} />
            {t('addStockBtn')}
          </button>
        ) : null}
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="border-separate border-spacing-1.5" data-testid="pd-grid">
          <thead>
            <tr>
              <th />
              {columns.map((size) => (
                <th
                  key={size?.id ?? 'one'}
                  className="text-center text-[13px] font-semibold text-fg-muted"
                >
                  {size?.value ?? ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {product.designs.map((design) => {
              const cover = product.images.find((image) => image.id === design.photoIds[0])?.urls
                .thumbnail;
              return (
                <tr key={design.id}>
                  <th>
                    {cover ? (
                      <img
                        src={cover}
                        alt={t('psDesignN', { n: design.number })}
                        className="size-10 rounded-[8px] object-cover"
                      />
                    ) : (
                      t('psDesignN', { n: design.number })
                    )}
                  </th>
                  {columns.map((size) => {
                    const cell = cellOf(design.id, size?.id ?? null);
                    const tone =
                      cell?.state === StockState.Out
                        ? 'bg-danger-soft text-danger'
                        : cell?.state === StockState.Low
                          ? 'bg-warning-soft text-warning'
                          : 'bg-surface';
                    return (
                      <td
                        key={size?.id ?? 'one'}
                        className={`num h-11 min-w-16 rounded-[10px] border border-line text-center text-[16px] font-semibold ${tone}`}
                      >
                        {cell ? Number(cell.available) : '–'}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[14px] text-fg-muted">{t('ppGridNote')}</p>
    </Card>
  );
}
