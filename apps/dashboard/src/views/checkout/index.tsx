import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import {
  useBillingTerms,
  useConfirmPurchase,
  usePlanPrices,
  usePlans,
  usePlatformWallets,
  useQuotePurchase,
} from '@/api/billing';
import { OnboardingFrame, StepLinks } from '@/components/onboarding/frame';
import { Notice } from '@/components/onboarding/notice';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Chip, ChipRow } from '@/components/ui/chips';
import { StatusTag } from '@/components/ui/status-tag';
import { WalletStep } from '@/components/wallet-step';
import { useErrorText } from '@/hooks/use-error-text';
import { PricingTable, type PricedOption } from '@/lib/pricing-table';
import { signUpIntent } from '@/session/sign-up-intent';
import type { PlanPayment } from '@/types/billing';

/**
 * Step 2b (AUTH-29; TENANT-DASHBOARD-DESIGN §6 and §7.19, the prototype's `ob-checkout` as drawn before Phase 5's
 * hosted page): the plan and term picked on the pricing page, changeable; the price, its monthly equivalent and the
 * saving; the no-refund line (BIL-18); then the wallet step (BIL-02, BIL-03), or "continue without paying", which
 * leaves the shop on its trial. Either way the password step follows. Paid at once ("Starter is on") waits for the
 * hosted page; until then a payment is checked, and the trial runs meanwhile.
 */
export function Checkout(): React.JSX.Element {
  const { t, i18n } = useTranslation('onboarding');
  const errorText = useErrorText();
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

  const termLabel = (option: PricedOption): string =>
    i18n.language === 'bn' ? option.term.labelBn : option.term.labelEn;
  const loading = plans.isLoading || terms.isLoading || prices.isLoading;
  const option = planId && termId ? table.option(planId, termId) : null;

  if (submitted) {
    return (
      <OnboardingFrame step={1} title={t('coTitle')}>
        <Notice tone="ok">{t('coDone')}</Notice>
        <p className="text-[14px] text-fg-muted">{t('coDoneNext')}</p>
        <Button wide onClick={continueToPassword}>
          {t('cont')}
        </Button>
      </OnboardingFrame>
    );
  }

  return (
    <OnboardingFrame step={1} title={t('coTitle')} lead={t('coLead')}>
      {loading ? (
        <p className="text-[14px] text-fg-muted">{t('loading')}</p>
      ) : table.isEmpty() ? (
        <>
          <Notice tone="warn">{t('noPlans')}</Notice>
          <Button wide onClick={continueToPassword}>
            {t('cont')}
          </Button>
        </>
      ) : (
        <>
          <ChipRow>
            {table.plans().map((plan) => (
              <Chip
                key={plan.id}
                on={plan.id === planId}
                onClick={() => {
                  const first = table.defaultOption(plan.id);
                  if (!first) return;
                  setPlanId(plan.id);
                  setTermId(first.term.id);
                }}
              >
                {plan.name}
              </Chip>
            ))}
          </ChipRow>
          {planId ? (
            <ChipRow>
              {table.termsFor(planId).map((term) => {
                const priced = table.option(planId, term.id);
                const label = i18n.language === 'bn' ? term.labelBn : term.labelEn;
                return (
                  <Chip
                    key={term.id}
                    on={term.id === termId}
                    onClick={() => {
                      setTermId(term.id);
                    }}
                  >
                    {priced && priced.savingPercent > 0
                      ? t('termSaving', { label, percent: priced.savingPercent })
                      : label}
                  </Chip>
                );
              })}
            </ChipRow>
          ) : null}
          {option ? (
            <div className="flex flex-col gap-3.5 rounded-card border border-brand-200 bg-primary-soft p-5">
              <div className="flex justify-between gap-3 text-[15px]">
                <span className="text-fg-muted">{`${option.plan.name} · ${termLabel(option)}`}</span>
                <span className="num text-right text-[22px] font-medium">
                  {formatTaka(option.price)}
                </span>
              </div>
              {option.term.months > 1 ? (
                <p className="text-[14px] text-fg-muted">
                  {t('coMonthly', { a: formatTaka(option.monthly) })}
                  {option.savingPercent > 0 ? (
                    <>
                      {' · '}
                      <StatusTag tone="ok">{t('coSaving', { p: option.savingPercent })}</StatusTag>
                    </>
                  ) : null}
                </p>
              ) : null}
              <p className="mt-1.5 text-[14px] text-fg-muted">{t('coNoRefund')}</p>
            </div>
          ) : null}
          {quotePurchase.isError ? (
            <Banner tone="bad">{errorText(quotePurchase.error)}</Banner>
          ) : null}
          {quote ? (
            <WalletStep
              spacious
              amount={quote.amount}
              wallets={wallets.data}
              pending={confirmPurchase.isPending}
              error={confirmPurchase.isError ? errorText(confirmPurchase.error) : null}
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
          ) : quotePurchase.isPending ? (
            <p className="text-[14px] text-fg-muted">{t('loading')}</p>
          ) : null}
        </>
      )}
      {loading || !table.isEmpty() ? (
        <StepLinks>
          <button type="button" onClick={continueToPassword}>
            {t('coSkip')}
          </button>
        </StepLinks>
      ) : null}
    </OnboardingFrame>
  );
}
