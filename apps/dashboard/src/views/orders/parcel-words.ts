import { ParcelAttention, ParcelReading, ParcelState } from '@lytronix/validators';
import type { StatusTone } from '@/components/ui/status-tag';
import type { OrderListParcel, ParcelNews } from '@/types/couriers';

/** CRR-29: what a courier's status means here, as the Courier card's chip says it (Part 36's `c36Reading`). */
export const READING_LOOK: Readonly<Record<ParcelReading, { word: string; tone: StatusTone }>> = {
  [ParcelReading.Booked]: { word: 'crReadBooked', tone: 'neutral' },
  [ParcelReading.WithCourier]: { word: 'crReadWith', tone: 'info' },
  [ParcelReading.Unconfirmed]: { word: 'crReadUnconfirmed', tone: 'neutral' },
  [ParcelReading.Hold]: { word: 'crReadHold', tone: 'warn' },
  [ParcelReading.Delivered]: { word: 'crReadDelivered', tone: 'ok' },
  [ParcelReading.PartlyDelivered]: { word: 'crReadPartly', tone: 'warn' },
  [ParcelReading.Returning]: { word: 'crReadReturning', tone: 'warn' },
  [ParcelReading.Problem]: { word: 'crReadProblem', tone: 'bad' },
};

/** A booked parcel the courier has said nothing about yet reads as booked, waiting for pickup. */
export const readingOf = (parcel: { reading: ParcelReading | null }): ParcelReading =>
  parcel.reading ?? ParcelReading.Booked;

/** What staff should look at (read agreed 2026-11-05), each in its own sentence. */
export const ATTENTION_WORD: Readonly<Record<ParcelAttention, string>> = {
  [ParcelAttention.CashDiffers]: 'crLookCash',
  [ParcelAttention.CodChanged]: 'crLookCod',
  [ParcelAttention.DeliveredAfterCancel]: 'crLookCancel',
  [ParcelAttention.ReportAfterDelivered]: 'crLookAfter',
};

/**
 * The Orders list's courier line (agreed 2026-11-06): where a booked order's parcel stands, short, as "Steadfast · with the
 * courier". A parcel delivered says nothing here, its order's status saying it; one still being booked or lost reads as waiting
 * for pickup. The drawing has no line for a problem, so it names the courier beside the Courier card's own words for it.
 */
export function listLineOf(
  parcel: OrderListParcel,
  t: (key: string, options?: Record<string, unknown>) => string,
  name: string,
): { text: string; warn: boolean } | null {
  const line = (word: string, warn = false) => ({ text: t(word, { c: name }), warn });
  if (parcel.state !== ParcelState.Booked) return line('crLineBooked');
  switch (readingOf(parcel)) {
    case ParcelReading.Booked:
      return line('crLineBooked');
    case ParcelReading.WithCourier:
    case ParcelReading.Unconfirmed:
      return line('crLineWith');
    case ParcelReading.Hold:
      return line('crLineHold', true);
    case ParcelReading.Problem:
      return { text: `${name} · ${t('crReadProblem')}`, warn: true };
    case ParcelReading.Returning:
      return line('crLineBack', true);
    case ParcelReading.Delivered:
    case ParcelReading.PartlyDelivered:
      return null;
  }
}

/** A piece of news in the viewer's language where the courier sent both; null when it sent no words (CRR-12). */
export function newsWords(news: ParcelNews, language: string): string | null {
  return language === 'bn'
    ? (news.message.bn ?? news.message.en)
    : (news.message.en ?? news.message.bn);
}
