import { useTranslation } from 'react-i18next';
import { dayLabel, formatDayMonth } from '@/lib/dates';

/** A change as the history writes it: its sign, and its size ("+10", "−3", with the true minus sign). */
export const signed = (delta: string): string => {
  const amount = Number(delta);
  return amount < 0 ? `−${String(-amount)}` : `+${String(amount)}`;
};

/** The day of a movement as the history says it: Today, Yesterday, or its date ("12 Oct"). */
export function useMovementDay(): (iso: string) => string {
  const { t } = useTranslation('shop');
  return (iso) => {
    const day = dayLabel(iso);
    // The day words are Money's, where a statement's days are named the same way.
    return day.kind === 'today'
      ? t('today', { ns: 'money' })
      : day.kind === 'yesterday'
        ? t('yesterday', { ns: 'money' })
        : formatDayMonth(iso);
  };
}
