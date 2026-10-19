import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { TenantState } from '@lytronix/validators';
import {
  useBillingTerms,
  useChoosePayAsYouGo,
  useConfirmPurchase,
  usePlanPrices,
  usePlans,
  usePlatformWallets,
  useQuotePurchase,
} from '@/api/billing';
import { useMe } from '@/api/me';
import { errorMessage } from '@/api/error-message';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { PricingTable } from '@/lib/pricing-table';
import type { PlanPayment } from '@/types/billing';
import { PaymentForm } from '@/views/checkout/payment-form';
import { PlanPicker } from '@/views/checkout/plan-picker';

/**
 * TRL-08's plan page and the renewal screen for a lapsed shop (LIF-11, LIF-15): the same picker and payment
 * step as the sign-up checkout, plus pay-as-you-go as the no-payment choice for a shop that is not on its
 * trial (PYG-01).
 */
export function Plans(): React.JSX.Element {
  const { t } = useTranslation();
  const { shop } = useParams({ from: '/$shop/plans' });
  const me = useMe();
  const [planId, setPlanId] = useState<string | null>(null);
  const [termId, setTermId] = useState<string | null>(null);
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
  const choosePayg = useChoosePayAsYouGo();

  const table = useMemo(
    () => new PricingTable(plans.data ?? [], terms.data ?? [], prices.prices),
    [plans.data, terms.data, prices.prices],
  );

  useEffect(() => {
    if (!planId || !termId || !table.option(planId, termId)) return;
    setQuote(null);
    requestQuote({ planId, billingTermId: termId }, { onSuccess: setQuote });
  }, [planId, termId, table, requestQuote]);

  const tenant = me.data?.tenant ?? null;
  const offersPayg =
    tenant !== null &&
    tenant.state !== TenantState.Trial &&
    tenant.state !== TenantState.PayAsYouGo;

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-5 px-4 py-5 sm:px-6 sm:py-6">
      <div>
        <h1 className="heading text-[22px] text-ink">{t('plans.title')}</h1>
        <p className="mt-1 text-[15px] text-neutral-700">{t('plans.lead')}</p>
      </div>

      {submitted ? (
        <div className="space-y-4 rounded-card border border-line bg-white p-4 shadow-card sm:p-5">
          <Notice tone="success">{t('checkout.submitted')}</Notice>
          <Link to="/$shop" params={{ shop }} className="block">
            <Button type="button">{t('plans.backHome')}</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-5 rounded-card border border-line bg-white p-4 shadow-card sm:p-5">
          {plans.isLoading || terms.isLoading || prices.isLoading ? (
            <p className="text-[15px] text-neutral-700">{t('common.loading')}</p>
          ) : table.isEmpty() ? (
            <Notice tone="warning">{t('checkout.noPlans')}</Notice>
          ) : (
            <PlanPicker
              table={table}
              planId={planId}
              termId={termId}
              onChange={(nextPlan, nextTerm) => {
                setPlanId(nextPlan);
                setTermId(nextTerm);
              }}
            />
          )}
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
                      setSubmitted(true);
                    },
                  },
                );
              }}
            />
          ) : null}
        </div>
      )}

      {offersPayg && !submitted ? (
        <div className="rounded-card border border-line bg-white p-4 shadow-card sm:p-5">
          <h2 className="text-[16px] font-bold text-ink">{t('plans.paygTitle')}</h2>
          <p className="mt-1 text-[14px] text-neutral-700">{t('plans.paygLead')}</p>
          {choosePayg.isSuccess ? (
            <Notice tone="success" className="mt-3">
              {choosePayg.data.effective === 'now'
                ? t('plans.paygNow')
                : t('plans.paygAtPeriodEnd')}
            </Notice>
          ) : (
            <div className="mt-3">
              <Button
                type="button"
                tone="outline"
                loading={choosePayg.isPending}
                onClick={() => {
                  choosePayg.mutate();
                }}
              >
                {t('plans.choosePayg')}
              </Button>
            </div>
          )}
          {choosePayg.isError ? (
            <Notice tone="danger" className="mt-3">
              {errorMessage(choosePayg.error, t)}
            </Notice>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
