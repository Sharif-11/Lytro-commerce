import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  useBillingTerms,
  useConfirmPurchase,
  usePlanPrices,
  usePlans,
  usePlatformWallets,
  useQuotePurchase,
} from '@/api/billing';
import { errorMessage } from '@lytronix/api-client';
import { Button, Notice } from '@lytronix/ui';
import { StepFrame } from '@/components/ui/step-frame';
import { PricingTable } from '@/lib/pricing-table';
import { signUpIntent } from '@/session/sign-up-intent';
import type { PlanPayment } from '@/types/billing';
import { PaymentForm } from './payment-form';
import { PlanPicker } from './plan-picker';

export const PENDING_PAYMENT_KEY = 'lytro.checkout.pending';

/**
 * Step 2b (AUTH-29): the plan and term pre-filled from the pricing page and changeable, the price and the
 * saving, the no-refund line (BIL-18), a wallet payment through the platform's numbers (BIL-02), and
 * "Continue without paying", which leaves the shop on its trial. Either way step 3 follows.
 */
export function Checkout(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const intent = signUpIntent.read();
  const [planId, setPlanId] = useState<string | null>(intent.planId);
  const [termId, setTermId] = useState<string | null>(intent.termId);
  const [quote, setQuote] = useState<PlanPayment | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const plans = usePlans();
  const terms = useBillingTerms();
  const prices = usePlanPrices(
    (plans.data ?? []).filter((plan) => plan.forSale).map((plan) => plan.id),
  );
  const wallets = usePlatformWallets();
  const quotePurchase = useQuotePurchase();
  const requestQuote = quotePurchase.mutate;
  const confirmPurchase = useConfirmPurchase();

  const table = useMemo(
    () => new PricingTable(plans.data ?? [], terms.data ?? [], prices.prices),
    [plans.data, terms.data, prices.prices],
  );

  // Re-quote whenever the choice changes (BIL-01); the quote is ephemeral until confirmed.
  useEffect(() => {
    if (!planId || !termId || !table.option(planId, termId)) return;
    setQuote(null);
    requestQuote({ planId, billingTermId: termId }, { onSuccess: setQuote });
  }, [planId, termId, table, requestQuote]);

  function continueToPassword(): void {
    signUpIntent.clearPlan();
    void navigate({ to: '/set-password', search: { required: false } });
  }

  const loading = plans.isLoading || terms.isLoading || prices.isLoading;

  return (
    <StepFrame
      step="checkout"
      title={t('checkout.title')}
      lead={t('checkout.lead')}
      footer={
        !submitted ? (
          <button
            type="button"
            className="min-h-10 font-semibold text-brand-800 underline"
            onClick={continueToPassword}
          >
            {t('checkout.continueWithoutPaying')}
          </button>
        ) : null
      }
    >
      {submitted ? (
        <div className="space-y-4">
          <Notice tone="success">{t('checkout.submitted')}</Notice>
          <p className="text-[15px] text-neutral-700">{t('checkout.submittedNext')}</p>
          <Button type="button" onClick={continueToPassword}>
            {t('common.continue')}
          </Button>
        </div>
      ) : loading ? (
        <p className="text-[15px] text-neutral-700">{t('common.loading')}</p>
      ) : table.isEmpty() ? (
        <div className="space-y-4">
          <Notice tone="warning">{t('checkout.noPlans')}</Notice>
          <Button type="button" onClick={continueToPassword}>
            {t('common.continue')}
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <PlanPicker
            table={table}
            planId={planId}
            termId={termId}
            onChange={(nextPlan, nextTerm) => {
              setPlanId(nextPlan);
              setTermId(nextTerm);
            }}
          />
          {quotePurchase.isError ? (
            <Notice tone="danger">{errorMessage(quotePurchase.error, t)}</Notice>
          ) : null}
          {quote ? (
            <PaymentForm
              quote={quote}
              wallets={wallets.data}
              pending={confirmPurchase.isPending}
              error={confirmPurchase.isError ? errorMessage(confirmPurchase.error, t) : null}
              onSubmit={(values) => {
                confirmPurchase.mutate(
                  { paymentId: quote.id, method: 'wallet', ...values },
                  {
                    onSuccess: () => {
                      try {
                        sessionStorage.setItem(PENDING_PAYMENT_KEY, quote.planId ?? '');
                      } catch {
                        // The home screen's note is a courtesy only.
                      }
                      setSubmitted(true);
                    },
                  },
                );
              }}
            />
          ) : quotePurchase.isPending ? (
            <p className="text-[14px] text-neutral-700">{t('checkout.quoting')}</p>
          ) : null}
        </div>
      )}
    </StepFrame>
  );
}
