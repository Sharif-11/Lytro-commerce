import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { ProductKind, SalesRanking } from '@lytronix/validators';
import { useBestSellers } from '@/api/sales';
import { Banner } from '@/components/ui/banner';
import { Card } from '@/components/ui/card';
import { RowLead, RowList, rowClass } from '@/components/ui/list-row';
import { SectionHead } from '@/components/ui/page';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { useErrorText } from '@/hooks/use-error-text';
import { useShell } from '@/shell/shell-context';
import type { BestSeller } from '@/types/sales';
import { useCountedText } from '@/views/product/stock-holders';
import { Segments } from '@/views/product/value-sheet';

const ON_THE_PAGE = 5;
/** The most the server gives at once. */
const ALL = 50;

/**
 * One product's place in the list: its rank, name, units and orders, and revenue. It opens its trend; a product since
 * deleted for good has none to open.
 */
function SellerRow({ seller, rank }: { seller: BestSeller; rank: number }): React.JSX.Element {
  const { t } = useTranslation('orders');
  const { t: shop } = useTranslation('shop');
  const { slug } = useShell();
  const counted = useCountedText();
  const inside = (
    <>
      <RowLead className="num font-bold">{rank}</RowLead>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[16px] font-medium">
          {seller.name}{' '}
          {seller.kind === ProductKind.Combo ? (
            <StatusTag tone="neutral">{shop('comboTag')}</StatusTag>
          ) : null}
        </span>
        <span className="num text-[14px] text-fg-muted">
          {counted(seller.units, seller.stockUnit)} · {t('saOrdersN', { count: seller.orders })}
        </span>
      </span>
      <span className="num flex-none text-[16px] font-semibold">{formatTaka(seller.revenue)}</span>
    </>
  );
  return seller.productId ? (
    <Link
      to="/$shop/sales/$productId"
      params={{ shop: slug, productId: seller.productId }}
      search={{ name: seller.name }}
      className={rowClass}
    >
      {inside}
    </Link>
  ) : (
    <div className={rowClass}>{inside}</div>
  );
}

/**
 * Best sellers (TENANT-DASHBOARD-DESIGN §7.34, the prototype's `sa32Best`; STA-02): the top five by units or by revenue,
 * a combo as itself, and See all, a sheet of the top 50 (`sh-sales32-all`).
 */
export function BestSellersCard({
  from,
  to,
  by,
  onBy,
}: {
  from: string;
  to: string;
  by: SalesRanking;
  onBy: (by: SalesRanking) => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const errorText = useErrorText();
  const [all, setAll] = useState(false);
  const top = useBestSellers({ from, to, by, limit: ON_THE_PAGE });
  const everything = useBestSellers({ from, to, by, limit: ALL }, { enabled: all });
  const sellers = top.data?.products ?? [];
  return (
    <Card flush>
      <div className="px-4 pt-4 pb-2">
        <SectionHead
          link={
            <button
              type="button"
              onClick={() => {
                setAll(true);
              }}
            >
              {t('saSeeAll')}
            </button>
          }
        >
          {t('saBest')}
        </SectionHead>
      </div>
      <div className="px-4 pb-2">
        <Segments
          label={t('saBest')}
          value={by}
          choices={[
            { value: SalesRanking.Units, label: t('saByUnits') },
            { value: SalesRanking.Revenue, label: t('saByRevenue') },
          ]}
          onChange={onBy}
        />
      </div>
      {top.isError ? <Banner tone="bad">{errorText(top.error)}</Banner> : null}
      {top.isPending ? <SkeletonRows count={3} /> : null}
      <RowList>
        {sellers.map((seller, index) => (
          <SellerRow
            key={`${seller.productId ?? seller.name}-${seller.stockUnit}`}
            seller={seller}
            rank={index + 1}
          />
        ))}
      </RowList>
      <Sheet
        open={all}
        title={t('saBest')}
        onClose={() => {
          setAll(false);
        }}
      >
        {everything.isError ? <Banner tone="bad">{errorText(everything.error)}</Banner> : null}
        {everything.isPending ? <SkeletonRows count={5} /> : null}
        <RowList>
          {(everything.data?.products ?? []).map((seller, index) => (
            <SellerRow
              key={`${seller.productId ?? seller.name}-${seller.stockUnit}`}
              seller={seller}
              rank={index + 1}
            />
          ))}
        </RowList>
      </Sheet>
    </Card>
  );
}
