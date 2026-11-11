import { useTranslation } from 'react-i18next';
import { helpLineOpenAt, type HelpLineView } from '@lytronix/validators';
import { wholeHour } from '@/lib/dates';

/**
 * The Menu's Help row's second line (Slice 8.8's `p88-menu`): the ways to reach Lytro, and open now or when it opens, by
 * Dhaka's clock.
 */
export function useHelpSubLine(line: HelpLineView, now: Date): string {
  const { t, i18n } = useTranslation('shell');
  const ways =
    line.whatsapp !== null && line.phone !== null
      ? t('p88help.waysBoth')
      : line.whatsapp !== null
        ? t('p88help.waysWa')
        : t('p88help.waysPhone');
  return helpLineOpenAt(line, now)
    ? t('p88help.subOpen', { ways })
    : t('p88help.subOpens', { ways, at: wholeHour(line.opensHour, i18n.language, true) });
}
