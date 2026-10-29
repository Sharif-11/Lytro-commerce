import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StockTracking } from '@lytronix/validators';
import { useCategories } from '@/api/catalogue';
import { mayKeepBatches, useBatchesOf, useCategoryStock, useStockPage } from '@/api/stock';
import { Button } from '@/components/ui/button';
import { CheckRow } from '@/components/ui/check-row';
import { SearchField } from '@/components/ui/search-field';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import type { StockPageProduct } from '@/types/stock';
import { ChoiceList, ChoiceRow } from '../product/choice-list';
import { Segments } from '../product/value-sheet';
import { useCountLines } from './check-lines';

// How long typing rests before the list asks the server.
const TYPING_REST_MS = 250;

type Side = 'products' | 'category';

/**
 * What to count (Part 20's `stock-check-pick`, v3.8's `stock-check-pick-category`; INV-07): some products, ticked
 * from the stock list found by name, or every product filed in one category. The button says how many lines that
 * makes, a product kept in batches counting each batch. Made to order counts no stock, so it is never offered.
 */
export function CheckPickSheet({
  open,
  onPick,
  onClose,
}: {
  open: boolean;
  onPick: (products: StockPageProduct[]) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const [side, setSide] = useState<Side>('products');
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [ticked, setTicked] = useState<ReadonlyMap<string, StockPageProduct>>(new Map());
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const list = useStockPage(open ? search : '', 'all');
  const categories = useCategories();
  const filed = useCategoryStock(open && side === 'category' ? categoryId : null);
  const countLines = useCountLines();

  useEffect(() => {
    if (!open) return;
    setSide('products');
    setTyped('');
    setSearch('');
    setTicked(new Map());
    setCategoryId(null);
  }, [open]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(typed);
    }, TYPING_REST_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [typed]);

  const tracked = (product: StockPageProduct) => product.stockTracking === StockTracking.Tracked;
  const chosen = side === 'products' ? [...ticked.values()] : (filed.data ?? []).filter(tracked);
  // A batch-kept product's lines are its batches, read as the check itself will read them.
  const kept = chosen.filter((product) => product.batchTracked);
  const batches = useBatchesOf(kept.map((product) => product.productId));
  const lines = chosen.reduce((total, product) => {
    const at = kept.indexOf(product);
    return total + countLines(product, at < 0 ? undefined : batches[at]?.data?.batches).length;
  }, 0);
  const products = (list.data?.pages ?? []).flatMap((page) => page.products).filter(tracked);

  return (
    <Sheet
      open={open}
      title={t('pickCountT')}
      onClose={onClose}
      footer={
        <Button
          wide
          disabled={lines === 0}
          busy={filed.isFetching || batches.some((each) => each.isFetching)}
          onClick={() => {
            onPick(chosen);
          }}
        >
          {t('pickCountBtn', { count: lines })}
        </Button>
      }
    >
      {open ? (
        <>
          <Segments<Side>
            label={t('pickCountT')}
            choices={[
              { value: 'products', label: t('pickProducts') },
              { value: 'category', label: t('pickOneCategory') },
            ]}
            value={side}
            onChange={setSide}
          />
          {side === 'products' ? (
            <>
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
                  products.map((product) => (
                    <div
                      key={product.productId}
                      className="border-b border-line px-4 py-3 last:border-b-0"
                    >
                      <CheckRow
                        checked={ticked.has(product.productId)}
                        onChange={() => {
                          setTicked((current) => {
                            const next = new Map(current);
                            if (next.has(product.productId)) next.delete(product.productId);
                            else next.set(product.productId, product);
                            return next;
                          });
                        }}
                        title={product.name}
                        sub={t('variantsN', { n: product.variants.length })}
                      />
                    </div>
                  ))
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
            </>
          ) : (
            <ChoiceList label={t('pickOneCategory')}>
              {(categories.data ?? [])
                .filter((category) => category.productCount > 0)
                .map((category) => (
                  <ChoiceRow
                    key={category.id}
                    roomy
                    on={categoryId === category.id}
                    title={category.name}
                    sub={t('productsN', { count: category.productCount })}
                    indent={(category.depth - 1) * 16}
                    onChoose={() => {
                      setCategoryId(category.id);
                    }}
                  />
                ))}
            </ChoiceList>
          )}
          {mayKeepBatches(list) ? (
            <p className="text-[14px] text-fg-muted">{t('pickCountHint')}</p>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}
