import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { OfferCutKind, OfferState, type OfferCut } from '@lytronix/validators';
import type { StatusTone } from '@/components/ui/status-tag';
import { formatShortDay } from '@/lib/dates';
import type { OfferSummary, PriceSpan } from '@/types/offers';

/** OF-14: each state's tag. */
const STATE: Record<OfferState, [StatusTone, string]> = {
  [OfferState.Running]: ['ok', 'of.running'],
  [OfferState.Waiting]: ['neutral', 'of.waiting'],
  [OfferState.Ended]: ['neutral', 'of.ended'],
};

/** A price span as a line says it: "৳360" or "৳360–392". */
export function spanText(span: PriceSpan): string {
  const low = formatTaka(span.low);
  return span.low === span.high ? low : `${low}–${formatTaka(span.high).replace('৳', '')}`;
}

/** OFFERS-PLAN: the words the Offers screens share -- the cut, the state, the list's line. */
export function useOfferWords() {
  const { t, i18n } = useTranslation('shop');
  const cut = (value: OfferCut): string =>
    value.kind === OfferCutKind.Percent
      ? t('of.percentOff', { n: value.amount })
      : t('of.takaOff', { amount: formatTaka(value.amount) });
  const state = (value: OfferState): [StatusTone, string] => {
    const [tone, key] = STATE[value];
    return [tone, t(key)];
  };
  /** The list's line: "20% off · 14 products · since 15 Nov". */
  const line = (offer: OfferSummary): string =>
    [
      cut(offer.cut),
      t('of.products', { count: offer.products }),
      offer.state === OfferState.Ended && offer.endedAt
        ? t('of.endedOn', { date: formatShortDay(offer.endedAt, i18n.language) })
        : offer.state === OfferState.Running && offer.startedAt
          ? t('of.since', { date: formatShortDay(offer.startedAt, i18n.language) })
          : null,
    ]
      .filter(Boolean)
      .join(' · ');
  return { cut, state, line };
}
