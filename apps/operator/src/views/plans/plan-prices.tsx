import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, CardTitle, ErrorBanner, TextField } from '@lytronix/ui';
import type { BillingTerm, PlanPrice } from '@/types/operator';

interface PlanPricesProps {
  terms: BillingTerm[];
  prices: PlanPrice[];
  pending: boolean;
  error: string | null;
  onSet: (billingTermId: string, price: number) => void;
  onRemove: (billingTermId: string) => void;
}

/** TRM-03: one price per live billing term, whole taka (PLN-03). Saved one row at a time. */
export function PlanPrices({
  terms,
  prices,
  pending,
  error,
  onSet,
  onRemove,
}: PlanPricesProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const current = (termId: string): string =>
    drafts[termId] ?? prices.find((price) => price.billingTermId === termId)?.price ?? '';

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>, termId: string): void {
    event.preventDefault();
    const value = Number(current(termId));
    if (Number.isInteger(value) && value > 0) onSet(termId, value);
  }

  return (
    <Card>
      <CardTitle>{t('plans.pricesTitle')}</CardTitle>
      <p className="mt-1 text-[13px] text-fg-muted">{t('plans.pricesLead')}</p>
      {error ? (
        <div className="mt-3">
          <ErrorBanner message={error} />
        </div>
      ) : null}
      {terms.length === 0 ? (
        <p className="mt-3 text-[13px] text-fg-muted">{t('plans.noTerms')}</p>
      ) : null}
      <div className="mt-3 space-y-3">
        {terms.map((term) => {
          const existing = prices.some((price) => price.billingTermId === term.id);
          return (
            <form
              key={term.id}
              onSubmit={(event) => {
                handleSubmit(event, term.id);
              }}
              className="flex flex-wrap items-end gap-2"
            >
              <div className="min-w-[160px] flex-1">
                <TextField
                  label={`${i18n.language === 'bn' ? term.labelBn : term.labelEn} · ${t('billingTerms.monthsCount', { count: term.months })}`}
                  name={`price-${term.id}`}
                  type="number"
                  min={1}
                  step={1}
                  leading="৳"
                  value={current(term.id)}
                  onChange={(event) => {
                    setDrafts((draft) => ({ ...draft, [term.id]: event.target.value }));
                  }}
                />
              </div>
              <Button type="submit" tone="outline" fit loading={pending}>
                {t('common.save')}
              </Button>
              {existing ? (
                <Button
                  type="button"
                  tone="danger"
                  fit
                  disabled={pending}
                  onClick={() => {
                    setDrafts((draft) =>
                      Object.fromEntries(Object.entries(draft).filter(([id]) => id !== term.id)),
                    );
                    onRemove(term.id);
                  }}
                >
                  {t('common.delete')}
                </Button>
              ) : null}
            </form>
          );
        })}
      </div>
    </Card>
  );
}
