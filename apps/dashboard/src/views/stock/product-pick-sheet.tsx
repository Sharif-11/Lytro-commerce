import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StockTracking } from '@lytronix/validators';
import { useStockPage } from '@/api/stock';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { RowList } from '@/components/ui/list-row';
import { SearchField } from '@/components/ui/search-field';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import type { StockPageProduct } from '@/types/stock';
import { heldOf, useStockLines } from './stock-lines';

// How long typing rests before the list asks the server.
const TYPING_REST_MS = 250;

/**
 * Add stock from the Stock page's header or the + menu (Part 20's `stock-add-pick`, design v3.7): which product arrived,
 * found by name, each with its variants and what it holds. Made-to-order products count no stock, so they are left out.
 */
export function ProductPickSheet({
  open,
  onPick,
  onClose,
}: {
  open: boolean;
  onPick: (product: StockPageProduct) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const linesOf = useStockLines();
  const list = useStockPage(open ? search : '', 'all');

  useEffect(() => {
    if (!open) return;
    setTyped('');
    setSearch('');
  }, [open]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(typed);
    }, TYPING_REST_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [typed]);

  const products = (list.data?.pages ?? [])
    .flatMap((page) => page.products)
    .filter((product) => product.stockTracking === StockTracking.Tracked);

  return (
    <Sheet open={open} title={t('addStockTitle')} onClose={onClose}>
      {open ? (
        <>
          <p className="text-[14px] text-fg-muted">{t('addPickHint')}</p>
          {/* The prototype's `.toolrow`: the box keeps its 44 px in a column. */}
          <div className="flex items-center gap-2">
            <SearchField
              value={typed}
              onChange={setTyped}
              placeholder={t('productName')}
              label={t('searchProducts')}
            />
          </div>
          <div className="flex-none overflow-hidden rounded-card border border-line">
            {list.isPending ? (
              <SkeletonRows count={3} />
            ) : products.length === 0 ? (
              <p className="px-4 py-3 text-[14px] text-fg-muted">{t('plNone')}</p>
            ) : (
              <RowList>
                {products.map((product) => {
                  const lines = linesOf(product);
                  const variants = product.shared ? product.variants.length : lines.length;
                  return (
                    <button
                      key={product.productId}
                      type="button"
                      onClick={() => {
                        onPick(product);
                      }}
                      className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[15px] font-medium">{product.name}</span>
                        <span className="num truncate text-[14px] text-fg-muted">
                          {[
                            variants > 1 ? t('variantsN', { n: variants }) : null,
                            t('onHandN', { n: String(heldOf(lines)) }),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      <Icon name="right" />
                    </button>
                  );
                })}
              </RowList>
            )}
          </div>
          {list.hasNextPage ? (
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
          ) : null}
          <p className="text-[14px] text-fg-muted">{t('addPickNote')}</p>
        </>
      ) : null}
    </Sheet>
  );
}
