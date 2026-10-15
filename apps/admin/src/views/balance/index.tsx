import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useBalance,
  useConfirmTopUp,
  useCurrentRates,
  useLedger,
  useQuoteTopUp,
  type LedgerFilters,
} from '@/api/balance';
import { errorMessage } from '@/api/error-message';
import { ApiClientError } from '@/api/client';
import { ErrorBanner } from '@/components/error-banner';
import { LedgerList } from '@/views/balance/ledger-list';
import { RatesCard } from '@/views/balance/rates-card';
import { TopUpForm, type ConfirmTopUpValues } from '@/views/balance/top-up-form';
import type { PlanPayment } from '@/types/plan-payment';

/** Container (ENGINEERING-STANDARDS.md §2a): owns every fetch, the top-up quote-then-pay flow's local
    state, and the ledger filters. TopUpForm/LedgerList/RatesCard stay presentational. */
export function Balance(): React.JSX.Element {
  const { t } = useTranslation();
  const balance = useBalance();
  const rates = useCurrentRates();
  const [filters, setFilters] = useState<LedgerFilters>({});
  const ledger = useLedger(filters);
  const quoteTopUp = useQuoteTopUp();
  const confirmTopUp = useConfirmTopUp();
  const [quote, setQuote] = useState<PlanPayment | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const topUpError = quoteTopUp.error ?? confirmTopUp.error;

  function resolveTopUpError(error: unknown): string {
    if (error instanceof ApiClientError && error.code === 'validation_error') {
      const min = typeof error.details.min === 'number' ? error.details.min : undefined;
      const max = typeof error.details.max === 'number' ? error.details.max : undefined;
      if (min !== undefined && max !== undefined) {
        return t('balance.amountOutOfRange', { min, max });
      }
    }
    return errorMessage(error, t);
  }

  function handleQuote(amount: number): void {
    setSubmitted(false);
    quoteTopUp.mutate(
      { amount },
      {
        onSuccess: setQuote,
      },
    );
  }

  function handleCancelQuote(): void {
    setQuote(null);
    quoteTopUp.reset();
  }

  function handleConfirm(values: ConfirmTopUpValues): void {
    if (!quote) return;
    confirmTopUp.mutate(
      { paymentId: quote.id, ...values },
      {
        onSuccess: () => {
          setQuote(null);
          setSubmitted(true);
          quoteTopUp.reset();
          confirmTopUp.reset();
        },
      },
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-5 py-6 sm:px-6 sm:py-8">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{t('balance.title')}</h1>
      </div>

      {balance.isLoading ? (
        <p className="text-center text-sm text-slate-500">{t('common.loading')}</p>
      ) : null}
      {balance.isError ? <ErrorBanner message={errorMessage(balance.error, t)} /> : null}
      {balance.data ? (
        <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <p className="text-3xl font-bold text-slate-900">{balance.data.amount} TK</p>
          {balance.data.frozen ? (
            <>
              <span className="mt-1 inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
                {t('balance.frozen')}
              </span>
              <p className="mt-2 text-sm text-slate-500">{t('balance.frozenNote')}</p>
            </>
          ) : null}
        </div>
      ) : null}

      <TopUpForm
        quote={quote}
        submitted={submitted}
        onQuote={handleQuote}
        onConfirm={handleConfirm}
        onCancelQuote={handleCancelQuote}
        quotePending={quoteTopUp.isPending}
        confirmPending={confirmTopUp.isPending}
        error={topUpError ? resolveTopUpError(topUpError) : null}
      />

      <RatesCard rates={rates.data} isLoading={rates.isLoading} />

      <div>
        <h2 className="mb-3 text-base font-semibold text-slate-900">{t('balance.ledgerTitle')}</h2>
        <LedgerList
          pages={ledger.data?.pages ?? []}
          filters={filters}
          onFiltersChange={setFilters}
          isLoading={ledger.isLoading}
          isError={ledger.isError}
          error={ledger.error ? errorMessage(ledger.error, t) : null}
          hasNextPage={ledger.hasNextPage}
          isFetchingNextPage={ledger.isFetchingNextPage}
          onLoadMore={() => void ledger.fetchNextPage()}
        />
      </div>
    </div>
  );
}
