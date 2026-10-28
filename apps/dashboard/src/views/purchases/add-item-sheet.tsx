import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CheckRow } from '@/components/ui/check-row';
import { RowList } from '@/components/ui/list-row';
import { Sheet } from '@/components/ui/sheet';
import type { StockPageProduct } from '@/types/stock';
import { useAmountText } from '../product/stock-holders';
import { ProductPickSheet } from '../stock/product-pick-sheet';
import { lineTitle, useStockLines, type StockLine } from '../stock/stock-lines';
import type { LineDraft } from './purchase-lines';

/** A product's variant as a purchase names it: the product alone where its variants share one stock (INV-24). */
const nameOf = (product: StockPageProduct, line: StockLine): string =>
  product.shared ? product.name : lineTitle(product, line);

/**
 * Add item (Part 21's `sh-po-add-item` and `sh-po-add-sizes`; agreed in the 11.10 read): the product, found by name as
 * Add stock finds it, then several of its variants ticked at once, each joining the purchase at no quantity yet. A
 * product with one variant, or one stock shared by all, joins at once. A variant the purchase has already is ticked and
 * cannot be ticked off here.
 */
export function AddItemSheet({
  open,
  listed,
  onAdd,
  onClose,
}: {
  open: boolean;
  /** The variants the purchase has already. */
  listed: ReadonlySet<string>;
  onAdd: (lines: LineDraft[]) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const linesOf = useStockLines();
  const amount = useAmountText();
  const [product, setProduct] = useState<StockPageProduct | null>(null);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setProduct(null);
    setTicked(new Set());
  }, [open]);

  const lines = product ? linesOf(product) : [];
  const draft = (of: StockPageProduct, line: StockLine): LineDraft => ({
    variantId: line.variantId,
    name: nameOf(of, line),
    quantity: '',
    cost: '',
  });

  return (
    <>
      <ProductPickSheet
        open={open && product === null}
        title={t('poAddItem')}
        hint={t('poWhichProduct')}
        note={null}
        onPick={(picked) => {
          const own = linesOf(picked);
          const only = own[0];
          if (own.length === 1 && only) {
            if (!listed.has(only.variantId)) onAdd([draft(picked, only)]);
            onClose();
            return;
          }
          setProduct(picked);
        }}
        onClose={onClose}
      />
      <Sheet
        open={open && product !== null}
        title={t('poAddItem')}
        onBack={() => {
          setProduct(null);
          setTicked(new Set());
        }}
        onClose={onClose}
        footer={
          <Button
            wide
            disabled={ticked.size === 0}
            onClick={() => {
              if (!product) return;
              onAdd(
                lines
                  .filter((line) => ticked.has(line.variantId))
                  .map((line) => draft(product, line)),
              );
              onClose();
            }}
          >
            {t('poAddN', { count: ticked.size })}
          </Button>
        }
      >
        {product ? (
          <>
            <p className="text-[14px] text-fg-muted">
              {product.name} · {t('poWhichVariants')}
            </p>
            <div className="flex-none overflow-hidden rounded-card border border-line">
              <RowList>
                {lines.map((line) => (
                  // 52 px as drawn: the tick row's 40 px and 6 px above and below; the row fills the width.
                  <div key={line.variantId} className="px-4 py-1.5">
                    <CheckRow
                      checked={listed.has(line.variantId) || ticked.has(line.variantId)}
                      disabled={listed.has(line.variantId)}
                      onChange={() => {
                        setTicked((now) => {
                          const next = new Set(now);
                          if (next.has(line.variantId)) next.delete(line.variantId);
                          else next.add(line.variantId);
                          return next;
                        });
                      }}
                      title={line.name}
                      sub={
                        <span className="num">
                          {t('onHandN', { n: amount(line.onHand, product.stockUnit) })}
                        </span>
                      }
                    />
                  </div>
                ))}
              </RowList>
            </div>
          </>
        ) : null}
      </Sheet>
    </>
  );
}
