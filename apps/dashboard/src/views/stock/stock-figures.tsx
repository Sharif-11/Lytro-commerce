import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { BatchState } from '@lytronix/validators';
import { useBatchCount, useInventoryFigures } from '@/api/stock';
import { StatRow, StatTile } from '@/components/ui/stat-tile';
import { useShell } from '@/shell/shell-context';

/** A figure that opens its page: as wide as a tile on a phone, a grid cell from 640 px (design §7.7). */
const TILE_LINK = 'block flex-[0_0_150px] rounded-card text-[inherit] no-underline sm:flex-auto';

/** The money figures open Stock value and losses (§7.22). */
function ToValue({ slug, children }: { slug: string; children: ReactNode }): React.JSX.Element {
  return (
    <Link to="/$shop/stock/value" params={{ shop: slug }} className={TILE_LINK}>
      {children}
    </Link>
  );
}

/**
 * The Stock page's figures (the prototype's `stock` stats; INV-13, INV-18, D3-9), for someone who may manage stock:
 * the stock's value now at average cost, this month's cost of goods sold, this month's losses by reason and how many
 * times, and, in a shop that may keep batches, those expiring within 30 days. The first three open Stock value and
 * losses, the last Expiring.
 */
export function StockFigures({
  keepsBatches,
}: {
  /** Some product on the page keeps its stock in batches, or the page has more to show. */
  keepsBatches: boolean;
}): React.JSX.Element | null {
  const { t } = useTranslation('shop');
  const { slug } = useShell();
  const figures = useInventoryFigures({ enabled: true });
  const expiring = useBatchCount(BatchState.Expiring, { enabled: true });
  if (!figures.data) return null;
  const { stockValue, costOfGoodsSold, losses } = figures.data;
  const reasons = losses.byReason
    .filter((each) => each.movements > 0)
    .map((each) => `${t(`loss_${each.reason}`)} ${String(each.movements)}`)
    .join(' · ');
  // A shop that keeps no batches has nothing to expire, and meets no figure saying so (design v3.15).
  const noBatches = expiring.data === 0 && !keepsBatches;
  const expiringNote =
    expiring.data === undefined ? null : expiring.data > 0 ? t('expWithin') : t('expNoneSoon');
  return (
    <StatRow label={t('figuresL')}>
      <ToValue slug={slug}>
        <StatTile
          className="h-full"
          label={t('stockValue')}
          value={formatTaka(stockValue.value)}
          note={t('svNow')}
        />
      </ToValue>
      <ToValue slug={slug}>
        <StatTile
          className="h-full"
          label={t('cogs')}
          value={formatTaka(costOfGoodsSold.value)}
          note={t('thisMonth')}
        />
      </ToValue>
      <ToValue slug={slug}>
        <StatTile
          className="h-full"
          label={t('losses')}
          value={formatTaka(losses.value)}
          // The sketch's "Damaged 2 · lost 1": the first word as a sentence starts.
          note={reasons ? reasons.charAt(0).toUpperCase() + reasons.slice(1) : t('lossesNone')}
          noteTone={reasons ? 'bad' : 'plain'}
        />
      </ToValue>
      {noBatches ? null : (
        <Link to="/$shop/stock/expiring" params={{ shop: slug }} className={TILE_LINK}>
          <StatTile
            className="h-full"
            label={t('expiring')}
            value={expiring.data ?? '—'}
            note={expiringNote}
          />
        </Link>
      )}
    </StatRow>
  );
}
