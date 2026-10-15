import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/button';
import { ErrorBanner } from '@/components/error-banner';
import type { BillingTerm, PlanPrice, PlanVersion } from '@/types/billing-admin';

interface PlanDetailPanelProps {
  terms: BillingTerm[];
  prices: PlanPrice[];
  onSetPrice: (billingTermId: string, price: number) => void;
  onRemovePrice: (billingTermId: string) => void;
  pricePending: boolean;
  priceError: string | null;
  versions: PlanVersion[] | undefined;
  versionsLoading: boolean;
}

/** TRM-03 + PLN-02, shown inline under the plan being edited rather than as separate screens — the plan's
    own planning note called this the simplest shape for a (plan, term) pricing pair plus a read-only
    version history, both scoped to whichever plan is currently open. */
export function PlanDetailPanel({
  terms,
  prices,
  onSetPrice,
  onRemovePrice,
  pricePending,
  priceError,
  versions,
  versionsLoading,
}: PlanDetailPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});

  function priceFor(termId: string): string {
    if (draftPrices[termId] !== undefined) return draftPrices[termId];
    return prices.find((price) => price.billingTermId === termId)?.price ?? '';
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>, termId: string): void {
    event.preventDefault();
    const value = Number(priceFor(termId));
    if (Number.isFinite(value) && value > 0) onSetPrice(termId, value);
  }

  return (
    <div className="space-y-6 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{t('operator.plans.pricesTitle')}</h3>
        {priceError ? (
          <div className="mt-2">
            <ErrorBanner message={priceError} />
          </div>
        ) : null}
        <div className="mt-3 space-y-2">
          {terms.map((term) => {
            const existing = prices.find((price) => price.billingTermId === term.id);
            return (
              <form
                key={term.id}
                onSubmit={(event) => {
                  handleSubmit(event, term.id);
                }}
                className="flex flex-wrap items-center gap-2"
              >
                <span className="min-w-32 flex-1 text-sm text-slate-700">{term.labelEn}</span>
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={priceFor(term.id)}
                  onChange={(event) => {
                    setDraftPrices((draft) => ({ ...draft, [term.id]: event.target.value }));
                  }}
                  className="w-28 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                />
                <Button type="submit" variant="outline" loading={pricePending} className="w-auto!">
                  {t('common.save')}
                </Button>
                {existing ? (
                  <button
                    type="button"
                    onClick={() => {
                      onRemovePrice(term.id);
                    }}
                    className="text-sm font-medium text-red-600 hover:underline"
                  >
                    {t('common.delete')}
                  </button>
                ) : null}
              </form>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-900">
          {t('operator.plans.versionsTitle')}
        </h3>
        {versionsLoading ? (
          <p className="mt-2 text-sm text-slate-500">{t('common.loading')}</p>
        ) : null}
        {!versionsLoading && (!versions || versions.length === 0) ? (
          <p className="mt-2 text-sm text-slate-400">{t('operator.plans.noVersionsYet')}</p>
        ) : null}
        {versions && versions.length > 0 ? (
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {versions.map((version) => (
              <li key={version.id}>
                {t('operator.plans.versionLine', {
                  version: version.version,
                  date: new Date(version.recordedAt).toLocaleString(),
                })}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
