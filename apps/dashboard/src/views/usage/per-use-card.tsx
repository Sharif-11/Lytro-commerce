import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka, formatTakaExact } from '@lytronix/ui';
import { Card } from '@/components/ui/card';
import { formatShortDay } from '@/lib/dates';
import { useShell } from '@/shell/shell-context';
import type { AddonOffer } from '@/types/addons';
import type { PayPerUse } from '@/types/usage';
import { readsOffer, readsPercent } from './per-use';

/** Buy reads: "200 reads · ৳20", to the add-on's sheet. */
export function BuyReadsLink({ offer }: { offer: AddonOffer }): React.JSX.Element {
  const { t } = useTranslation('money');
  const { slug } = useShell();
  return (
    <Link
      to="/$shop/addons"
      params={{ shop: slug }}
      search={{ buy: offer.addon.key }}
      className="font-semibold text-primary"
    >
      {t('p37RdBuy', { n: offer.addon.unitSize ?? 0 })} · {formatTaka(offer.addon.price)}
    </Link>
  );
}

/**
 * Usage's pay-per-use card (Part 37's `p37-usage*`, PLN-20, D7-36): the reads pack's uses against its size until it ends,
 * then each at the rate from the balance; with no pack, the rate and this cycle's reads, and the pack to buy.
 */
export function PerUseCard({
  reads,
  offers,
}: {
  reads: PayPerUse;
  offers: readonly AddonOffer[];
}): React.JSX.Element {
  const { t, i18n } = useTranslation('money');
  const rate = formatTakaExact(reads.rate);
  const pool = reads.allowance;
  const percent = readsPercent(reads) ?? 0;
  const tone = percent >= 95 ? 'bg-danger' : percent >= 80 ? 'bg-warning' : 'bg-primary';
  const offer = readsOffer(offers);
  return (
    <Card flush>
      <div className="px-4 pt-3 pb-1 text-[12px] font-bold tracking-[0.04em] text-neutral-700 uppercase">
        {t('p37UPerUse')}
      </div>
      <div className="flex flex-col gap-1.5 border-t border-line px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-semibold">{t('p37UReads')}</span>
          <span className="num text-right text-[13px] text-fg-muted">
            {pool
              ? t('p37UReadsV', {
                  u: pool.used,
                  l: pool.total,
                  d: formatShortDay(pool.endsAt, i18n.language),
                })
              : t('p37UReadsNone', { r: rate, n: reads.outsideAllowance.count })}
          </span>
        </div>
        {pool ? (
          <>
            <div className="h-2 overflow-hidden rounded-[4px] bg-neutral-100">
              <i
                className={`block h-full rounded-[4px] ${tone}`}
                style={{ width: `${String(Math.min(100, percent))}%` }}
              />
            </div>
            <p className="text-[13px] text-fg-muted">{t('p37UReadsThen', { r: rate })}</p>
          </>
        ) : offer ? (
          <p className="text-[13px] text-fg-muted">
            <BuyReadsLink offer={offer} />
          </p>
        ) : null}
      </div>
    </Card>
  );
}
