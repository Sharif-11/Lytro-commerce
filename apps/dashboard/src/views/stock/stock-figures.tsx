import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { useExpiringCount, useInventoryFigures } from '@/api/stock';
import { StatRow, StatTile } from '@/components/ui/stat-tile';

/**
 * The Stock page's figures (the prototype's `stock` stats; INV-13, INV-18, D3-9), for someone who may manage stock:
 * the stock's value now at average cost, this month's cost of goods sold, this month's losses by reason and how many
 * times, and the batches expiring within 30 days.
 */
export function StockFigures({
  keepsBatches,
}: {
  /** Some product on the page keeps its stock in batches, or the page has more to show. */
  keepsBatches: boolean;
}): React.JSX.Element | null {
  const { t } = useTranslation('shop');
  const figures = useInventoryFigures({ enabled: true });
  const expiring = useExpiringCount({ enabled: true });
  if (!figures.data) return null;
  const { stockValue, costOfGoodsSold, losses } = figures.data;
  const reasons = losses.byReason
    .filter((each) => each.movements > 0)
    .map((each) => `${t(`loss_${each.reason}`)} ${String(each.movements)}`)
    .join(' · ');
  const expiringNote =
    expiring.data === undefined
      ? null
      : expiring.data > 0
        ? t('expWithin')
        : keepsBatches
          ? t('expNoneSoon')
          : t('expNoBatches');
  return (
    <StatRow label={t('figuresL')}>
      <StatTile label={t('stockValue')} value={formatTaka(stockValue.value)} note={t('svNow')} />
      <StatTile label={t('cogs')} value={formatTaka(costOfGoodsSold.value)} note={t('thisMonth')} />
      <StatTile
        label={t('losses')}
        value={formatTaka(losses.value)}
        // The sketch's "Damaged 2 · lost 1": the first word as a sentence starts.
        note={reasons ? reasons.charAt(0).toUpperCase() + reasons.slice(1) : t('lossesNone')}
        noteTone={reasons ? 'bad' : 'plain'}
      />
      <StatTile label={t('expiring')} value={expiring.data ?? '—'} note={expiringNote} />
    </StatRow>
  );
}
