import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission } from '@lytronix/validators';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { RowList } from '@/components/ui/list-row';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import type { ComboIssue } from '@/types/attribute';
import type { StockPageProduct } from '@/types/stock';
import { StockTag } from '../products/product-row';
import { lineTitle, useStockLines, type StockLine } from './stock-lines';

const figure = (amount: string): string => String(Number(amount));

/**
 * Short for orders (TENANT-DASHBOARD-DESIGN §7.33, the prototype's `k31-stock`; INV-15): orders hold more than is on
 * the shelf, after a stock check or a write-off. Each with what is held, on hand and short, Add stock and See the
 * orders holding it (agreed 2026-11-02). Nothing short, no card.
 */
export function ShortCard({
  products,
  onAdd,
}: {
  products: readonly StockPageProduct[];
  onAdd: (product: StockPageProduct, line: StockLine) => void;
}): React.JSX.Element | null {
  const { t } = useTranslation('shop');
  const { slug, viewer } = useShell();
  const linesOf = useStockLines();
  const mayAdd = allows(viewer, [Permission.InventoryManage]);
  const maySee = allows(viewer, [Permission.OrdersRead]);
  const rows = products.flatMap((product) =>
    linesOf(product)
      .filter((line) => Number(line.short) > 0)
      .map((line) => ({ product, line, title: lineTitle(product, line) })),
  );
  if (rows.length === 0) return null;
  return (
    <Card flush className="!border-danger">
      <div className="px-4 pt-3.5 pb-1.5">
        <Banner tone="bad">{t('shortBanner', { count: products.length })}</Banner>
        <p className="mt-2 text-[14px] text-fg-muted">{t('shortWhy')}</p>
      </div>
      <RowList>
        {rows.map(({ product, line, title }) => (
          <div
            key={line.variantId}
            className="flex flex-col gap-2 px-4 py-3 sm:grid sm:grid-cols-[150px_1fr_auto] sm:items-center sm:gap-4"
          >
            <span className="text-[15px] font-medium">{title}</span>
            <span className="text-[13px] font-semibold text-danger">
              {t('shortRow', {
                held: figure(line.waiting),
                onHand: figure(line.onHand),
                short: figure(line.short),
              })}
            </span>
            {mayAdd || maySee ? (
              <span className="flex gap-1">
                {mayAdd ? (
                  <Button
                    size="xs"
                    aria-label={t('addStockFor', { name: title })}
                    onClick={() => {
                      onAdd(product, line);
                    }}
                  >
                    {t('addStockBtn')}
                  </Button>
                ) : null}
                {maySee ? (
                  <Link
                    to="/$shop/orders"
                    params={{ shop: slug }}
                    search={{ tab: 'all', holding: line.variantId, holdingName: title }}
                    aria-label={t('shortSeeOrdersFor', { name: title })}
                    className={buttonClass('outline', 'xs')}
                  >
                    {t('shortSeeOrders')}
                  </Link>
                ) : null}
              </span>
            ) : null}
          </div>
        ))}
      </RowList>
    </Card>
  );
}

const REASON: Record<ComboIssue['reason'], string> = {
  part_archived: 'comboPartArchived',
  part_off_sale: 'comboPartOffSale',
  part_retired: 'comboPartRetired',
  no_choice_left: 'comboNoChoice',
};

/**
 * Combos (the prototype's `k31-stock`, CMB-02, CMB-08): each with how many it can make and what limits it, or why it
 * can't be made. A combo holds no stock of its own, so it sits here and not in the list below.
 */
export function CombosCard({
  products,
}: {
  products: readonly StockPageProduct[];
}): React.JSX.Element | null {
  const { t } = useTranslation('shop');
  const { slug } = useShell();
  if (products.length === 0) return null;
  return (
    <Card flush>
      <div className="px-4 pt-3.5 pb-1.5">
        <h3 className="mb-1 text-[17px] font-semibold">{t('combosTitle')}</h3>
      </div>
      <RowList>
        {products.map((product) => {
          const combo = product.combo;
          const issue = combo?.issues[0];
          return (
            <Link
              key={product.productId}
              to="/$shop/products/$productId"
              params={{ shop: slug, productId: product.productId }}
              className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left text-[inherit] no-underline"
            >
              <span className="flex size-12 flex-none items-center justify-center rounded-button bg-gradient-to-br from-neutral-100 to-neutral-200 text-neutral-400">
                <Icon name="layers" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[16px] font-medium">{product.name}</span>
                {issue ? (
                  <span className="text-[14px] text-danger">
                    {t(REASON[issue.reason], { part: issue.productName })}
                  </span>
                ) : combo?.limitedBy ? (
                  <span className="truncate text-[14px] text-fg-muted">
                    {t('comboLimited', {
                      part: combo.limitedBy.productName,
                      count: Number(combo.limitedBy.available),
                    })}
                  </span>
                ) : null}
              </span>
              <span className="flex flex-none flex-col items-end gap-1 text-right sm:flex-row sm:items-center sm:gap-4">
                {combo?.canMake == null ? null : (
                  <span className="num text-[16px] font-semibold">
                    {t('comboCanMake', { count: combo.canMake })}
                  </span>
                )}
                <StockTag state={product.state} />
              </span>
            </Link>
          );
        })}
      </RowList>
    </Card>
  );
}
