import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission } from '@lytronix/validators';
import { mayKeepBatches, STOCK_SEGMENTS, useStockPage, type StockSegment } from '@/api/stock';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { Chip, ChipRow } from '@/components/ui/chips';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchField } from '@/components/ui/search-field';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useErrorText } from '@/hooks/use-error-text';
import { SEGMENT_LABEL } from '@/lib/product-segments';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { StockPageProduct } from '@/types/stock';
import { StockSheets, type StockSheet } from '../product/stock-card';
import { CostSheet } from './cost-sheet';
import { EditStockSheet } from './edit-stock-sheet';
import { ProductPickSheet } from './product-pick-sheet';
import { PurchaseHistorySheet } from './purchase-history-sheet';
import { RowSheet } from './row-sheet';
import { StockFigures } from './stock-figures';
import { kindOf, stockedOf, useStockLines, wantsSeeing, type StockLine } from './stock-lines';
import { StockProduct, type LineAction } from './stock-product';

// How long typing rests before the list asks the server.
const TYPING_REST_MS = 250;

/** The sheet over the page, on one product's row: its own, Edit stock, Average cost, or one of the Stock card's. */
type Open =
  | { kind: 'row' | 'edit' | 'cost' | 'purchases'; product: StockPageProduct; variantId: string }
  | { kind: 'card'; product: StockPageProduct; sheet: StockSheet };

/**
 * Stock (TENANT-DASHBOARD-DESIGN §7.7, the prototype's `stock` and Part 20; INV-01, INV-06, INV-08, INV-10, INV-18):
 * the figures for someone who may manage stock, the search and the All, Low and Out segments, the products wanting
 * seeing to in full and the rest folded into "Stock is fine", a row's own sheet, Add stock, Edit stock and Average cost;
 * Add stock from the header or the + menu picks its product first; Check stock opens the stock checks. Someone who may
 * only look sees the rows alone.
 */
export function StockView({
  search,
  segment,
  addAsked,
}: {
  search: string;
  segment: StockSegment;
  /** The + menu's Add stock (`?add=1`). */
  addAsked: boolean;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { slug, viewer } = useShell();
  const mayManage = allows(viewer, [Permission.InventoryManage]);
  const mayAddProducts = allows(viewer, [Permission.ProductsManage]);
  const [typed, setTyped] = useState(search);
  const [fineOpen, setFineOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState<Open | null>(null);
  const [picking, setPicking] = useState(false);
  const list = useStockPage(search, segment);
  const linesOf = useStockLines();

  function show(next: { q?: string; seg?: StockSegment }): void {
    const q = next.q ?? search;
    const seg = next.seg ?? segment;
    void navigate({
      to: '/$shop/stock',
      params: { shop: slug },
      search: { q: q.trim() ? q : undefined, seg: seg === 'all' ? undefined : seg },
      replace: true,
    });
  }

  useEffect(() => {
    if (typed === search) return;
    const timer = window.setTimeout(() => {
      show({ q: typed });
    }, TYPING_REST_MS);
    return () => {
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);

  // The + menu's Add stock opens the pick once, and leaves the address as it was.
  useEffect(() => {
    if (!addAsked) return;
    if (mayManage) setPicking(true);
    show({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addAsked]);

  const pages = list.data?.pages ?? [];
  const first = pages[0];
  const products = pages.flatMap((page) => page.products);
  const lined = products.map((product) => ({ product, lines: linesOf(product) }));
  const searching = search.trim() !== '';
  const newShop = first !== undefined && !searching && segment === 'all' && first.counts.all === 0;
  // Design v3.7: a search shows what it finds in full, folding nothing.
  const wanting = searching ? lined : lined.filter((each) => wantsSeeing(each.product, each.lines));
  const fine = searching ? [] : lined.filter((each) => !wantsSeeing(each.product, each.lines));
  const keepsBatches = mayKeepBatches(list);

  // The sheets read the product as the page now has it, so a change shows in them at once.
  const current = (product: StockPageProduct): StockPageProduct =>
    products.find((each) => each.productId === product.productId) ?? product;
  const shown = open ? current(open.product) : null;
  const lineOf = (product: StockPageProduct | null, variantId: string): StockLine | null =>
    product ? (linesOf(product).find((line) => line.variantId === variantId) ?? null) : null;
  const rowOpen = open?.kind === 'row' ? lineOf(shown, open.variantId) : null;
  const editOpen = open?.kind === 'edit' ? lineOf(shown, open.variantId) : null;
  const costOpen = open?.kind === 'cost' ? lineOf(shown, open.variantId) : null;
  const purchasesOpen = open?.kind === 'purchases' ? lineOf(shown, open.variantId) : null;
  const close = () => {
    setOpen(null);
  };

  const act = (product: StockPageProduct, line: StockLine, action: LineAction) => {
    if (action === 'add') {
      setOpen({ kind: 'card', product, sheet: { kind: 'add', variantId: line.variantId } });
    } else {
      setOpen({ kind: action === 'open' ? 'row' : 'edit', product, variantId: line.variantId });
    }
  };

  const block = (each: { product: StockPageProduct; lines: StockLine[] }) => (
    <StockProduct
      key={each.product.productId}
      product={each.product}
      lines={each.lines}
      mayManage={mayManage}
      opened={moreOpen.has(each.product.productId)}
      onMore={() => {
        setMoreOpen((opened) => new Set(opened).add(each.product.productId));
      }}
      onAction={(line, action) => {
        act(each.product, line, action);
      }}
    />
  );

  return (
    <ShellPage
      actions={
        mayManage ? (
          <>
            {/* Design v3.8: Check stock opens the list of checks, whose New check starts one. */}
            <Link
              to="/$shop/stock/checks"
              params={{ shop: slug }}
              className={buttonClass('outline', 'sm')}
            >
              <Icon name="list" />
              {t('checkStockBtn')}
            </Link>
            <Button
              size="sm"
              onClick={() => {
                setPicking(true);
              }}
            >
              <Icon name="plus" />
              {t('addStockBtn')}
            </Button>
          </>
        ) : null
      }
    >
      {mayManage && !newShop ? <StockFigures keepsBatches={keepsBatches} /> : null}
      {list.isError ? <Banner tone="bad">{errorText(list.error)}</Banner> : null}
      {newShop ? (
        <Card>
          <EmptyState
            icon="box"
            action={
              mayAddProducts ? (
                <Link
                  to="/$shop/products/new"
                  params={{ shop: slug }}
                  className={buttonClass('primary', 'sm')}
                >
                  {t('addProduct')}
                </Link>
              ) : undefined
            }
          >
            {t('noProducts')}
          </EmptyState>
        </Card>
      ) : (
        <>
          {/* The prototype's `.toolrow`: the box keeps its 44 px in a column. */}
          <div className="flex items-center gap-2">
            <SearchField
              value={typed}
              onChange={setTyped}
              placeholder={t('productName')}
              label={t('searchProducts')}
            />
          </div>
          <ChipRow role="group">
            {STOCK_SEGMENTS.map((each) => (
              <Chip
                key={each}
                on={segment === each}
                // As drawn, All carries no count.
                count={!first || each === 'all' ? null : first.counts[each]}
                onClick={() => {
                  show({ seg: each });
                }}
              >
                {t(SEGMENT_LABEL[each])}
              </Chip>
            ))}
          </ChipRow>
          {list.isPending ? (
            <Card flush>
              <SkeletonRows count={4} />
            </Card>
          ) : products.length === 0 && list.isSuccess ? (
            <Card>
              {searching ? (
                <EmptyState
                  icon="search"
                  action={
                    <Button
                      tone="outline"
                      size="sm"
                      onClick={() => {
                        setTyped('');
                        show({ q: '', seg: 'all' });
                      }}
                    >
                      {t('plShowAll')}
                    </Button>
                  }
                >
                  {t('plNone')}
                </EmptyState>
              ) : (
                <EmptyState icon="box">
                  {segment === 'out' ? t('noneOut') : t('noneLow')}
                </EmptyState>
              )}
            </Card>
          ) : (
            <>
              {wanting.length > 0 ? <Card flush>{wanting.map(block)}</Card> : null}
              {fine.length > 0 && fineOpen ? (
                <Card flush>
                  {fine.map(block)}
                  <div className="px-4 pt-2 pb-3">
                    <Button
                      tone="ghost"
                      size="sm"
                      aria-expanded
                      onClick={() => {
                        setFineOpen(false);
                      }}
                    >
                      {t('showLess')}
                    </Button>
                  </div>
                </Card>
              ) : fine.length > 0 ? (
                <button
                  type="button"
                  aria-expanded={false}
                  onClick={() => {
                    setFineOpen(true);
                  }}
                  className="flex min-h-[52px] w-full items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 text-left"
                >
                  <span className="flex size-10 flex-none items-center justify-center rounded-button bg-info-soft text-info">
                    <Icon name="clock" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-medium">
                      {fine.map((each) => each.product.name).join(', ')}
                    </span>
                    <span className="truncate text-[14px] text-fg-muted">{t('stockFine')}</span>
                  </span>
                  <Icon name="right" />
                </button>
              ) : null}
            </>
          )}
          {list.hasNextPage && first ? (
            <div className="flex flex-col gap-2">
              <Button
                tone="outline"
                wide
                busy={list.isFetchingNextPage}
                onClick={() => {
                  void list.fetchNextPage();
                }}
              >
                {t('plMore')}
              </Button>
              <p className="text-center text-[14px] text-fg-muted">
                {t('plShown', { shown: products.length, total: first.total })}
              </p>
            </div>
          ) : null}
        </>
      )}
      <RowSheet
        product={rowOpen ? shown : null}
        line={rowOpen}
        mayManage={mayManage}
        onChoose={(choice) => {
          if (!shown || !rowOpen) return;
          if (choice === 'cost' || choice === 'purchases') {
            setOpen({ kind: choice, product: shown, variantId: rowOpen.variantId });
          } else {
            setOpen({
              kind: 'card',
              product: shown,
              sheet: { kind: choice, variantId: rowOpen.variantId },
            });
          }
        }}
        onClose={close}
      />
      <EditStockSheet product={editOpen ? shown : null} line={editOpen} onClose={close} />
      <CostSheet product={costOpen ? shown : null} line={costOpen} onClose={close} />
      <PurchaseHistorySheet
        product={purchasesOpen ? shown : null}
        line={purchasesOpen}
        onClose={close}
      />
      {shown ? (
        <StockSheets
          sheet={open?.kind === 'card' ? open.sheet : null}
          product={stockedOf(shown)}
          stock={shown}
          kind={kindOf(shown)}
          mayManage={mayManage}
          onSheet={(sheet) => {
            setOpen(sheet ? { kind: 'card', product: shown, sheet } : null);
          }}
        />
      ) : null}
      <ProductPickSheet
        open={picking}
        onPick={(product) => {
          setPicking(false);
          setOpen({
            kind: 'card',
            product,
            sheet: { kind: 'add', variantId: linesOf(product)[0]?.variantId ?? null },
          });
        }}
        onClose={() => {
          setPicking(false);
        }}
      />
    </ShellPage>
  );
}
