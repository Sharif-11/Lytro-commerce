import { useTranslation } from 'react-i18next';
import { Chip } from '@/components/ui/chip';
import { formatTaka } from '@/lib/money';
import type { PricingTable } from '@/lib/pricing-table';

interface PlanPickerProps {
  table: PricingTable;
  planId: string | null;
  termId: string | null;
  onChange: (planId: string, termId: string) => void;
}

/** The plan and term, pre-filled and changeable, with the price, the monthly equivalent and the saving
    against the shortest term (TRM-12, BIL-01). Presentational: the figures come from PricingTable. */
export function PlanPicker({
  table,
  planId,
  termId,
  onChange,
}: PlanPickerProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const plans = table.plans();
  const terms = planId ? table.termsFor(planId) : [];
  const option = planId && termId ? table.option(planId, termId) : null;

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[14px] font-bold text-ink">{t('checkout.plan')}</p>
        <div className="flex flex-wrap gap-2">
          {plans.map((plan) => (
            <Chip
              key={plan.id}
              selected={plan.id === planId}
              onClick={() => {
                const first = table.defaultOption(plan.id);
                if (first) onChange(plan.id, first.term.id);
              }}
            >
              {plan.name}
            </Chip>
          ))}
        </div>
      </div>
      {terms.length > 0 ? (
        <div>
          <p className="mb-2 text-[14px] font-bold text-ink">{t('checkout.term')}</p>
          <div className="flex flex-wrap gap-2">
            {terms.map((term) => {
              const priced = planId ? table.option(planId, term.id) : null;
              return (
                <Chip
                  key={term.id}
                  selected={term.id === termId}
                  onClick={() => {
                    if (planId) onChange(planId, term.id);
                  }}
                >
                  {i18n.language === 'bn' ? term.labelBn : term.labelEn}
                  {priced && priced.savingPercent > 0 ? (
                    <span className="num rounded-full bg-accent-100 px-1.5 text-[11px] text-accent-700">
                      −{priced.savingPercent}%
                    </span>
                  ) : null}
                </Chip>
              );
            })}
          </div>
        </div>
      ) : null}
      {option ? (
        <div className="rounded-card border border-line bg-neutral-50 px-4 py-3">
          <p className="num flex items-baseline gap-2">
            <span className="text-[28px] font-bold text-ink">{formatTaka(option.price)}</span>
            <span className="text-[14px] text-neutral-700">
              {option.term.months === 1
                ? t('checkout.perMonth')
                : t('checkout.perTerm', { months: option.term.months })}
            </span>
          </p>
          {option.term.months > 1 ? (
            <p className="num mt-1 text-[14px] text-neutral-700">
              {t('checkout.monthlyEquivalent', { amount: formatTaka(option.monthly) })}
              {option.savingPercent > 0
                ? ` · ${t('checkout.saving', { percent: option.savingPercent })}`
                : ''}
            </p>
          ) : null}
          <p className="mt-2 text-[13px] text-neutral-700">{t('checkout.noRefund')}</p>
        </div>
      ) : null}
    </div>
  );
}
