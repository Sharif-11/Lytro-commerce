import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { BatchState, Permission } from '@lytronix/validators';
import { useBatchCount, useShopBatches, useWriteOff } from '@/api/stock';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip, ChipRow } from '@/components/ui/chips';
import { EmptyState } from '@/components/ui/empty-state';
import { RowList, RowText } from '@/components/ui/list-row';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { useErrorText } from '@/hooks/use-error-text';
import { daysUntil, formatDayMonth } from '@/lib/dates';
import { splitsOf } from '@/lib/variant-matrix';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { ShopBatch, ShopBatchPage } from '@/types/stock';
import { useCountedText } from '../product/stock-holders';
import { useVariantWords } from '../product/variant-words';
import { WriteOffDetails } from '../product/write-off';

/** The page's two segments: what needs seeing to (expiring, then expired), or the expired alone. */
export type ExpiringSegment = 'expiring' | 'expired';

/**
 * Expiring (TENANT-DASHBOARD-DESIGN §7.9, the prototype's `expiring`, `sh-writeoff` and Part 20's `expiring-empty`;
 * INV-13): the shop's batches expiring within 30 days, soonest first, then those expired, each with its product and
 * variant, code, expiry and what it holds, how many days are left or Expired; an expired one is written off, for
 * someone who may change stock, with the loss at average cost. Expired alone on its own segment.
 */
export function ExpiringView({ segment }: { segment: ExpiringSegment }): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { slug, viewer } = useShell();
  const mayManage = allows(viewer, [Permission.InventoryManage]);
  const list = useShopBatches(segment === 'expired' ? BatchState.Expired : null);
  const expiringCount = useBatchCount(BatchState.Expiring, { enabled: true });
  const expiredCount = useBatchCount(BatchState.Expired, { enabled: true });
  const words = useVariantWords();
  const counted = useCountedText();
  const [going, setGoing] = useState<ShopBatch | null>(null);

  // As drawn: what is still expiring first, soonest first, then what has expired.
  const batches = [...(list.data?.batches ?? [])].sort(
    (a, b) => Number(a.state === BatchState.Expired) - Number(b.state === BatchState.Expired),
  );
  const nameOf = (page: ShopBatchPage, batch: ShopBatch): string => {
    const splits = page.products.find((each) => each.productId === batch.productId)?.splits ?? [];
    return batch.optionIds.length > 0
      ? `${batch.productName} · ${words.variant(batch.optionIds, splitsOf({ variantAttributes: splits }))}`
      : batch.productName;
  };

  return (
    <ShellPage>
      <ChipRow role="group">
        {(
          [
            ['expiring', t('expiring'), expiringCount.data],
            ['expired', t('batchExpired'), expiredCount.data],
          ] as const
        ).map(([each, label, count]) => (
          <Chip
            key={each}
            on={segment === each}
            count={count ?? null}
            onClick={() => {
              void navigate({
                to: '/$shop/stock/expiring',
                params: { shop: slug },
                search: { seg: each === 'expiring' ? undefined : each },
                replace: true,
              });
            }}
          >
            {label}
          </Chip>
        ))}
      </ChipRow>
      {list.isError ? <Banner tone="bad">{errorText(list.error)}</Banner> : null}
      {list.isPending ? (
        <Card flush>
          <SkeletonRows count={3} />
        </Card>
      ) : batches.length === 0 ? (
        <Card>
          <EmptyState icon="clock">
            {segment === 'expired' ? t('expiredNone') : t('expiringNone')}
          </EmptyState>
        </Card>
      ) : (
        <Card flush>
          <RowList>
            {batches.map((batch) => {
              const expired = batch.state === BatchState.Expired;
              return (
                <div key={batch.id} className="flex min-h-16 items-center gap-3 px-4 py-3">
                  <span
                    className={`flex size-10 flex-none items-center justify-center rounded-[8px] ${expired ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'}`}
                  >
                    <Icon name="clock" />
                  </span>
                  <RowText
                    title={list.data ? nameOf(list.data, batch) : batch.productName}
                    sub={
                      <span className="num">
                        {[
                          batch.batchCode ?? '—',
                          batch.expiresOn ? formatDayMonth(batch.expiresOn) : null,
                          counted(batch.quantity, batch.stockUnit),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    }
                  />
                  <span className="flex flex-none flex-col items-end gap-1">
                    {expired ? (
                      <StatusTag tone="bad">{t('batchExpired')}</StatusTag>
                    ) : (
                      <StatusTag tone="warn">
                        {t('batchExpiresIn', {
                          n: batch.expiresOn ? daysUntil(batch.expiresOn) : 0,
                        })}
                      </StatusTag>
                    )}
                    {expired && mayManage ? (
                      <Button
                        tone="outline"
                        size="xs"
                        aria-label={`${t('writeOff')}: ${batch.batchCode ?? batch.productName}`}
                        onClick={() => {
                          setGoing(batch);
                        }}
                      >
                        {t('writeOff')}
                      </Button>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </RowList>
        </Card>
      )}
      <p className="text-[14px] text-fg-muted">{t('expHint')}</p>
      <WriteOffSheet
        batch={going}
        onClose={() => {
          setGoing(null);
        }}
      />
    </ShellPage>
  );
}

/** The write-off step over Expiring (the prototype's `sh-writeoff`): the batch, the units left, the loss, Write off. */
function WriteOffSheet({
  batch,
  onClose,
}: {
  batch: ShopBatch | null;
  onClose: () => void;
}): React.JSX.Element | null {
  if (!batch) return null;
  return <WriteOff key={batch.id} batch={batch} onClose={onClose} />;
}

function WriteOff({
  batch,
  onClose,
}: {
  batch: ShopBatch;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const writeOff = useWriteOff(batch.productId);
  return (
    <Sheet
      open
      title={t('woTitle')}
      onClose={onClose}
      footer={
        <Button
          wide
          tone="danger"
          busy={writeOff.isPending}
          onClick={() => {
            writeOff.mutate(batch.id, { onSuccess: onClose });
          }}
        >
          {t('woBtn', { n: String(Number(batch.quantity)) })}
        </Button>
      }
    >
      <div className="flex flex-col gap-1">
        <WriteOffDetails batch={batch} unit={batch.stockUnit} avgCost={batch.avgCost ?? null} />
        {writeOff.isError ? <Banner tone="bad">{errorText(writeOff.error)}</Banner> : null}
      </div>
    </Sheet>
  );
}
