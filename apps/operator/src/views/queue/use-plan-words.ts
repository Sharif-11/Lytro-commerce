import { useTranslation } from 'react-i18next';
import { useBillingTerms } from '@/api/billing-terms';
import { usePlans } from '@/api/plans';
import type { Plan } from '@/types/operator';

/** A payment's plan and term by name: the queue's rows name them by id. */
export function usePlanWords(): {
  planOf: (id: string | null) => Plan | undefined;
  termOf: (id: string | null) => string;
} {
  const { i18n } = useTranslation();
  const plans = usePlans();
  const terms = useBillingTerms();
  return {
    planOf: (id) => plans.data?.find((plan) => plan.id === id),
    termOf: (id) => {
      const term = terms.data?.find((each) => each.id === id);
      if (!term) return '';
      return i18n.language === 'bn' ? term.labelBn : term.labelEn;
    },
  };
}
