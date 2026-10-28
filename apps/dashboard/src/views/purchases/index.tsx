import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission, PurchaseStatus } from '@lytronix/validators';
import {
  PURCHASE_SEGMENTS,
  usePurchaseCount,
  usePurchases,
  useSuppliers,
  type PurchaseSegment,
} from '@/api/purchases';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { chipClass } from '@/components/ui/classes';
import { Chip, ChipCount, ChipRow } from '@/components/ui/chips';
import { EmptyState } from '@/components/ui/empty-state';
import { RowChevron, RowList, rowClass } from '@/components/ui/list-row';
import { Eyebrow } from '@/components/ui/page';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { useErrorText } from '@/hooks/use-error-text';
import { formatDayMonth } from '@/lib/dates';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import { PurchaseSheet } from './purchase-sheet';
import { purchaseNumber, usePurchaseWords } from './purchase-words';

/** Each segment's chip word. */
const SEGMENT_WORD: Record<PurchaseSegment, string> = {
  open: 'poOpen',
  drafts: 'poDrafts',
  all: 'poAll',
};

/**
 * Purchases (TENANT-DASHBOARD-DESIGN §7.21, the prototype's `purchases` and Part 21; PUR-02, PUR-05): Open holds what is
 * on order, Drafts and All the rest, Suppliers its own page; what is coming in every unit; each purchase with its
 * number and supplier, its units, items and date, and its status. Order from supplier for someone who may change stock.
 */
export function PurchasesView({ segment }: { segment: PurchaseSegment }): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { slug, viewer } = useShell();
  const mayManage = allows(viewer, [Permission.InventoryManage]);
  const list = usePurchases(segment);
  const drafts = usePurchaseCount('drafts');
  const everything = usePurchaseCount('all');
  const suppliers = useSuppliers({});
  const words = usePurchaseWords();
  const [ordering, setOrdering] = useState(false);
  const pages = list.data?.pages ?? [];
  const first = pages[0];
  const purchases = pages.flatMap((page) => page.purchaseOrders);
  const none = everything.data === 0;

  const order = (withIcon: boolean) =>
    mayManage ? (
      <Button
        size="sm"
        onClick={() => {
          setOrdering(true);
        }}
      >
        {withIcon ? <Icon name="plus" /> : null}
        {t('poNew')}
      </Button>
    ) : null;

  return (
    <ShellPage actions={order(true)}>
      <ChipRow role="group">
        {PURCHASE_SEGMENTS.map((each) => (
          <Chip
            key={each}
            on={segment === each}
            count={each === 'drafts' ? (drafts.data ?? null) : null}
            onClick={() => {
              void navigate({
                to: '/$shop/purchases',
                params: { shop: slug },
                search: { seg: each === 'open' ? undefined : each },
                replace: true,
              });
            }}
          >
            {t(SEGMENT_WORD[each])}
          </Chip>
        ))}
        <Link to="/$shop/purchases/suppliers" params={{ shop: slug }} className={chipClass(false)}>
          {t('suppliers')}
          {suppliers.data ? <ChipCount on={false}>{suppliers.data.total}</ChipCount> : null}
        </Link>
      </ChipRow>
      {first && first.coming.purchases > 0 ? (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <Eyebrow>{t('poIncoming')}</Eyebrow>
              <div className="num text-[22px] font-bold">
                {t('poComing', {
                  units: words.units(first.coming.units),
                  count: first.coming.purchases,
                })}
              </div>
            </div>
            <Icon name="truck" />
          </div>
        </Card>
      ) : null}
      {list.isError ? <Banner tone="bad">{errorText(list.error)}</Banner> : null}
      {list.isPending ? (
        <Card flush>
          <SkeletonRows count={3} />
        </Card>
      ) : purchases.length === 0 && list.isSuccess ? (
        <Card>
          <EmptyState icon="truck" action={none ? (order(false) ?? undefined) : undefined}>
            {none ? t('poEmpty') : segment === 'drafts' ? t('poNoDrafts') : t('poNoneOpen')}
          </EmptyState>
        </Card>
      ) : (
        <Card flush>
          <RowList>
            {purchases.map((purchase) => {
              const shown = words.status(purchase.status);
              const number = purchaseNumber(purchase.number);
              return (
                <Link
                  key={purchase.id}
                  to="/$shop/purchases/$purchaseId"
                  params={{ shop: slug, purchaseId: purchase.id }}
                  className={rowClass}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[16px] font-medium">
                      <span className={`mr-1.5 font-semibold text-fg-muted ${number ? 'num' : ''}`}>
                        {number ?? t('poDraft')}
                      </span>
                      {purchase.supplier?.name ?? t('noSupplier')}
                    </span>
                    <span className="truncate text-[14px] text-fg-muted">
                      {[
                        words.units(purchase.units),
                        t('poItemsN', { count: purchase.items }),
                        formatDayMonth(purchase.orderedAt ?? purchase.createdAt),
                        purchase.status === PurchaseStatus.Ordered && purchase.expectedOn
                          ? t('poExpectedOn', { date: formatDayMonth(purchase.expectedOn) })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <StatusTag tone={shown.tone}>{shown.word}</StatusTag>
                  <RowChevron />
                </Link>
              );
            })}
          </RowList>
        </Card>
      )}
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
      <PurchaseSheet
        open={ordering}
        onClose={() => {
          setOrdering(false);
        }}
      />
    </ShellPage>
  );
}
