import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBalance, useConfirmTopUp, useQuoteTopUp } from '@/api/balance';
import { errorMessage } from '@/api/error-message';
import { ApiClientError } from '@/api/client';
import { AuthCard } from '@/components/auth-card';
import { Button } from '@/components/button';
import { ErrorBanner } from '@/components/error-banner';
import { TopUpForm, type ConfirmTopUpValues } from '@/views/balance/top-up-form';
import type { PlanPayment } from '@/types/plan-payment';

interface SuspendedProps {
  onSignOut: () => void;
  signOutPending: boolean;
}

/**
 * LIF-24 (decided 2026-10-16): the narrow view a suspended owner reaches instead of the full dashboard --
 * only the balance and top-up, the "activity that benefits the operator side." Not the broader read_only set
 * (no data view/export) and never staff (DashboardGuard's own suspendedOwner carve-out already restricts
 * this). Renewing from here still needs a plan/term picker this screen doesn't build yet (KNOWN-GAPS.md) --
 * topping up is the one self-contained action available today.
 */
export function Suspended({ onSignOut, signOutPending }: SuspendedProps): React.JSX.Element {
  const { t } = useTranslation();
  const balance = useBalance();
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
    quoteTopUp.mutate({ amount }, { onSuccess: setQuote });
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
    <AuthCard
      title={t('dashboard.suspended.title')}
      subtitle={t('dashboard.suspended.subtitle')}
      footer={
        <Button type="button" variant="outline" loading={signOutPending} onClick={onSignOut}>
          {t('dashboard.logout')}
        </Button>
      }
    >
      <div className="space-y-4">
        {balance.isLoading ? (
          <p className="text-center text-sm text-slate-500">{t('common.loading')}</p>
        ) : null}
        {balance.isError ? <ErrorBanner message={errorMessage(balance.error, t)} /> : null}
        {balance.data ? (
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-3xl font-bold text-slate-900">{balance.data.amount} TK</p>
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
      </div>
    </AuthCard>
  );
}
