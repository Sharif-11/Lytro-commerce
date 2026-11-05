import { useState, type FocusEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { Button, ErrorBanner } from '@lytronix/ui';
import { useRemovePlanPrice, useSetPlanPrice } from '@/api/plans';
import { SMALL_BUTTON, TABLE_HEADER_WORD } from '@/components/ui/sizes';
import { StatusChip } from '@/components/ui/status-chip';
import { useToast } from '@/components/ui/use-toast';
import { taka } from '@/lib/format';
import { limitValue } from '@/lib/limit-words';
import { prefilledPrice } from '@/lib/price-prefill';
import { termLabel } from '@/lib/term-label';
import type { BillingTerm, OperatorPlan, PlanPrice } from '@/types/operator';

const HEAD = `sticky top-0 border-b border-line bg-neutral-50 px-3 py-2.5 text-left whitespace-nowrap ${TABLE_HEADER_WORD}`;
const CELL = 'border-b border-line px-3 py-2.5 whitespace-nowrap [tr:last-child>&]:border-b-0';
// On a phone the prices scroll under the plan, so it stays clear whose they are.
const PINNED =
  'max-sm:sticky max-sm:left-0 max-sm:z-[1] max-sm:bg-surface max-sm:shadow-[1px_0_0_var(--color-line)]';

/** A price that saves on Enter; a cleared one saves as "not offered" (TRM-13). */
function PriceCell({
  plan,
  term,
  terms,
  prices,
  onProblem,
}: {
  plan: OperatorPlan;
  term: BillingTerm;
  terms: readonly BillingTerm[];
  prices: readonly PlanPrice[];
  onProblem: (problem: string | null) => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const set = useSetPlanPrice();
  const remove = useRemovePlanPrice();
  const [draft, setDraft] = useState<string | null>(null);
  const [started, setStarted] = useState('');
  const stored = prices.find((price) => price.billingTermId === term.id)?.price;
  const storedWords = stored === undefined ? '' : String(Number(stored));
  const label = termLabel(term, i18n.language);
  const place = { plan: plan.name, term: label };
  const unsaved = draft !== null && draft !== started;

  function handleFocus(event: FocusEvent<HTMLInputElement>): void {
    if (draft !== null) return;
    const input = event.currentTarget;
    const start = stored === undefined ? prefilledPrice(term, terms, prices) : Number(stored);
    const words = start === null ? '' : String(start);
    setDraft(words);
    setStarted(words);
    requestAnimationFrame(() => {
      input.select();
    });
  }

  function handleBlur(): void {
    if (unsaved) onProblem(t('plans.unsavedCell', place));
    else setDraft(null);
  }

  function save(): void {
    const typed = (draft ?? '').replaceAll(',', '').trim();
    if (typed === storedWords) {
      setDraft(null);
      onProblem(null);
      return;
    }
    const after = {
      onSuccess: () => {
        setDraft(null);
        onProblem(null);
      },
      onError: (error: unknown) => {
        onProblem(errorMessage(error, t));
      },
    };
    if (typed === '') {
      remove.mutate(
        { planId: plan.id, billingTermId: term.id },
        {
          ...after,
          onSuccess: () => {
            after.onSuccess();
            toast(t('plans.priceRemoved', place));
          },
        },
      );
      return;
    }
    const price = Number(typed);
    if (!Number.isInteger(price) || price <= 0) {
      onProblem(t('plans.priceWhole'));
      return;
    }
    set.mutate(
      { planId: plan.id, billingTermId: term.id, price },
      {
        ...after,
        onSuccess: () => {
          after.onSuccess();
          toast(t('plans.priceSaved', { ...place, price: taka(price) }));
        },
      },
    );
  }

  function handleKey(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      save();
    }
    if (event.key === 'Escape') {
      // Leaving with a change raises the reminder, so this leaves first and then takes it back.
      event.currentTarget.blur();
      setDraft(null);
      onProblem(null);
    }
  }

  return (
    <input
      aria-label={`${plan.name}, ${label}`}
      inputMode="numeric"
      enterKeyHint="done"
      autoComplete="off"
      placeholder="—"
      disabled={!plan.forSale}
      readOnly={set.isPending || remove.isPending}
      value={draft ?? (stored === undefined ? '' : Number(stored).toLocaleString('en-US'))}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKey}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      className={`mono h-9 w-[92px] rounded-md border bg-surface px-2 text-right text-[16px] text-fg placeholder:text-neutral-500 focus:border-line-active focus:ring-2 focus:ring-field-ring focus:outline-none disabled:border-dashed disabled:bg-neutral-50 disabled:text-neutral-500 sm:text-[13px] ${
        unsaved ? 'border-accent-500 ring-2 ring-accent-100' : 'border-line-strong'
      }`}
    />
  );
}

/** OPERATOR-CONSOLE-DESIGN §6: a row per plan, a column per live term, a price in every cell that is offered. */
export function PriceMatrix({
  plans,
  terms,
  prices,
  onEdit,
}: {
  plans: readonly OperatorPlan[];
  terms: readonly BillingTerm[];
  prices: readonly PlanPrice[];
  onEdit: (plan: OperatorPlan) => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <>
      {problem ? <ErrorBanner message={problem} /> : null}
      <section className="overflow-auto rounded-card border border-line bg-surface">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className={`${HEAD} ${PINNED}`}>{t('plans.cPlan')}</th>
              <th className={HEAD}>{t('plans.cLimits')}</th>
              {terms.map((term) => (
                <th key={term.id} className={`${HEAD} text-right!`}>
                  {termLabel(term, i18n.language)}
                  {term.visible ? null : (
                    <span className="ml-1 text-[11px] font-medium normal-case">
                      {t('plans.hidden')}
                    </span>
                  )}
                </th>
              ))}
              <th className={HEAD}>
                <span className="sr-only">{t('common.edit')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={plan.id} className={plan.forSale ? '' : 'text-fg-muted'}>
                <td className={`${CELL} ${PINNED}`}>
                  <div className="text-[15px] font-semibold">
                    {plan.name}{' '}
                    <span className="text-[13px] font-medium text-fg-muted">v{plan.version}</span>
                  </div>
                  <div className="text-[13px] text-fg-muted">
                    <StatusChip tone={plan.forSale ? 'ok' : 'mute'} plain>
                      {t(plan.forSale ? 'plans.forSaleChip' : 'plans.notForSale')}
                    </StatusChip>{' '}
                    · {t('plans.rank')} {plan.rank}
                  </div>
                </td>
                <td className={`${CELL} text-[13px] text-fg-muted`}>
                  {limitValue(plan.limits.products, t)} {t('limits.products').toLowerCase()} ·{' '}
                  {limitValue(plan.limits.orders_handled_monthly, t)}{' '}
                  {t('limits.orders_handled_monthly').toLowerCase()}
                </td>
                {terms.map((term) => (
                  <td key={term.id} className={`${CELL} text-right`}>
                    <PriceCell
                      plan={plan}
                      term={term}
                      terms={terms}
                      prices={prices.filter((price) => price.planId === plan.id)}
                      onProblem={setProblem}
                    />
                  </td>
                ))}
                <td className={CELL}>
                  <Button
                    type="button"
                    tone="outline"
                    small
                    fit
                    className={SMALL_BUTTON}
                    aria-label={`${t('common.edit')} ${plan.name}`}
                    onClick={() => {
                      onEdit(plan);
                    }}
                  >
                    {t('common.edit')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
