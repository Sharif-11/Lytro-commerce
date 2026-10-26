import { useTranslation } from 'react-i18next';
import { Chip, ChipRow } from '@/components/ui/chips';
import type { BillingTerm } from '@/types/billing';
import type { PricingTable } from '@/lib/pricing-table';
import { termLabel } from './figures';

/** The term chips over the plan cards (TRM-12): each term, with its saving against the shortest. */
export function TermChips({
  terms,
  table,
  termId,
  onPick,
}: {
  terms: readonly BillingTerm[];
  table: PricingTable;
  termId: string | null;
  onPick: (termId: string) => void;
}): React.JSX.Element | null {
  const { t, i18n } = useTranslation('money');
  if (terms.length < 2) return null;
  return (
    <ChipRow>
      {terms.map((term) => {
        const percent = table.discountPercent(term.id);
        const label = termLabel(term, i18n.language);
        return (
          <Chip
            key={term.id}
            on={term.id === termId}
            onClick={() => {
              onPick(term.id);
            }}
          >
            {percent > 0 ? t('termOff', { term: label, percent }) : label}
          </Chip>
        );
      })}
    </ChipRow>
  );
}
