import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBalance } from '@/api/balance';
import {
  useConfirmPurchase,
  useConfirmUpgrade,
  usePlatformWallets,
  useQuotePurchase,
  useQuoteUpgrade,
} from '@/api/billing';
import { errorMessage } from '@/api/error-message';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/notice';
import { Sheet } from '@/components/ui/sheet';
import { formatTaka } from '@/lib/money';
import type { PricingTable } from '@/lib/pricing-table';
import type { Plan, PlanPayment } from '@/types/billing';
import { WalletStep } from '@/views/billing/wallet-step';

export interface PayIntent {
  kind: 'purchase' | 'upgrade';
  plan: Plan;
  termId: string;
}

interface PaySheetProps {
  intent: PayIntent | null;
  table: PricingTable;
  onClose: () => void;
  onPaid: (message: string) => void;
}

/**
 * Buying, renewing or upgrading (BIL-01, UPG-03/06/16): the quote is fetched when the sheet opens; the lines
 * show the price, the credit for an upgrade, and the amount due; then "Pay from balance" with the available
 * balance on the button, or the wallet step. The validity and the no-refund line come last.
 */
export function PaySheet({ intent, table, onClose, onPaid }: PaySheetProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const wallets = usePlatformWallets();
  const balance = useBalance();
  const quotePurchase = useQuotePurchase();
  const quoteUpgrade = useQuoteUpgrade();
  const confirmPurchase = useConfirmPurchase();
  const confirmUpgrade = useConfirmUpgrade();
  const [quote, setQuote] = useState<PlanPayment | null>(null);
  const [walletStep, setWalletStep] = useState(false);

  const requestPurchase = quotePurchase.mutate;
  const requestUpgrade = quoteUpgrade.mutate;
  useEffect(() => {
    if (!intent) return;
    setQuote(null);
    setWalletStep(false);
    const input = { planId: intent.plan.id, billingTermId: intent.termId };
    if (intent.kind === 'upgrade') requestUpgrade(input, { onSuccess: setQuote });
    else requestPurchase(input, { onSuccess: setQuote });
  }, [intent, requestPurchase, requestUpgrade]);

  const isUpgrade = intent?.kind === 'upgrade';
  const confirm = isUpgrade ? confirmUpgrade : confirmPurchase;
  const quoting = isUpgrade ? quoteUpgrade : quotePurchase;
  const option = intent ? table.option(intent.plan.id, intent.termId) : null;
  const termLabel = option
    ? i18n.language === 'bn'
      ? option.term.labelBn
      : option.term.labelEn
    : '';
  const available = balance.data && !balance.data.frozen ? Number(balance.data.amount) : null;
  const canPayFromBalance =
    quote !== null && available !== null && available >= Number(quote.amount);
  const paidMessage = isUpgrade ? t('plan.upgradePaid') : t('plan.purchasePaid');

  function close(): void {
    onClose();
    quotePurchase.reset();
    quoteUpgrade.reset();
    confirmPurchase.reset();
    confirmUpgrade.reset();
  }

  return (
    <Sheet
      open={intent !== null}
      title={
        intent
          ? isUpgrade
            ? t('plan.upgradeTo', { plan: intent.plan.name })
            : t('plan.takePlan', { plan: intent.plan.name })
          : ''
      }
      onClose={close}
    >
      {quoting.isPending ? (
        <p className="py-6 text-center text-[15px] text-neutral-700">{t('checkout.quoting')}</p>
      ) : null}
      {quoting.isError ? <ErrorBanner message={errorMessage(quoting.error, t)} /> : null}

      {quote && intent && !walletStep ? (
        <div className="space-y-4">
          <div className="space-y-2 text-[15px]">
            <Line
              label={`${intent.plan.name}, ${termLabel}`}
              value={formatTaka(Number(quote.amount) + Number(quote.creditAmount))}
            />
            {Number(quote.creditAmount) > 0 ? (
              <Line
                label={t('plan.creditLine')}
                value={`−${formatTaka(quote.creditAmount)}`}
                tone="success"
              />
            ) : null}
            <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2 font-bold">
              <span>{t('plan.dueNow')}</span>
              <span className="num text-[24px] text-ink">{formatTaka(quote.amount)}</span>
            </div>
          </div>
          <p className="rounded-control border-l-[3px] border-brand-500 bg-brand-50 px-3.5 py-2.5 text-[14px] text-brand-900">
            {isUpgrade
              ? t('plan.upgradeStarts', { months: option?.term.months ?? 1 })
              : t('plan.purchaseStarts')}
          </p>
          {confirm.isError ? <ErrorBanner message={errorMessage(confirm.error, t)} /> : null}
          <div className="space-y-2">
            {available !== null ? (
              <Button
                type="button"
                tone="accent"
                disabled={!canPayFromBalance}
                loading={confirm.isPending}
                className="justify-between!"
                onClick={() => {
                  confirm.mutate(
                    { paymentId: quote.id, method: 'balance' },
                    {
                      onSuccess: () => {
                        onPaid(paidMessage);
                        close();
                      },
                    },
                  );
                }}
              >
                <span>{t('plan.payFromBalance', { amount: formatTaka(quote.amount) })}</span>
                <span className="num text-[13px] font-medium">
                  {t('plan.available', { amount: formatTaka(available) })}
                </span>
              </Button>
            ) : null}
            {available !== null && !canPayFromBalance ? (
              <p className="text-center text-[13px] text-neutral-700">
                {t('checkout.balanceTooLow')}
              </p>
            ) : null}
            <p className="text-center text-[13px] text-neutral-700">{t('plan.orWallet')}</p>
            <Button
              type="button"
              tone={available !== null ? 'outline' : 'accent'}
              onClick={() => {
                setWalletStep(true);
              }}
            >
              {t('plan.payByWallet', { amount: formatTaka(quote.amount) })}
            </Button>
          </div>
          <p className="text-[13px] text-neutral-700">
            {isUpgrade ? t('plan.quoteHolds15') : t('plan.quoteHolds30')} {t('checkout.noRefund')}
          </p>
        </div>
      ) : null}

      {quote && walletStep ? (
        <WalletStep
          amount={quote.amount}
          wallets={wallets.data}
          pending={confirm.isPending}
          error={confirm.isError ? errorMessage(confirm.error, t) : null}
          submitLabel={t('balance.iHaveSent', { amount: formatTaka(quote.amount) })}
          onSubmit={(values) => {
            confirm.mutate(
              { paymentId: quote.id, method: 'wallet', ...values },
              {
                onSuccess: () => {
                  onPaid(t('checkout.submitted'));
                  close();
                },
              },
            );
          }}
          onBack={() => {
            setWalletStep(false);
          }}
        />
      ) : null}
    </Sheet>
  );
}

function Line({
  label,
  value,
  tone = 'ink',
}: {
  label: string;
  value: string;
  tone?: 'ink' | 'success';
}): React.JSX.Element {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-neutral-700">{label}</span>
      <b className={`num ${tone === 'success' ? 'text-success' : 'text-ink'}`}>{value}</b>
    </div>
  );
}
