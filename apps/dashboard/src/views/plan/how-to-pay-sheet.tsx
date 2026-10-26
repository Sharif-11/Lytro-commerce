import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTakaExact } from '@lytronix/ui';
import { useBalance } from '@/api/balance';
import {
  useConfirmPurchase,
  usePlatformWallets,
  useQuotePurchase,
  useRefreshPrices,
} from '@/api/billing';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RadioMark } from '@/components/ui/kv';
import { Sheet } from '@/components/ui/sheet';
import { WalletMarks } from '@/components/wallet-marks';
import { WalletStep } from '@/components/wallet-step';
import { useErrorText } from '@/hooks/use-error-text';
import { formatDayMonthYear } from '@/lib/dates';
import { walletNames, walletProviders } from '@/lib/wallet-marks';
import type { PlanPayment, PlanPriceOption } from '@/types/billing';
import { useShopAfterPayment } from './after-pay';
import { changedAmount, taka } from './words';

interface HowToPaySheetProps {
  /** The plan bought or renewed, as GET /billing/prices reads it now. */
  option: PlanPriceOption;
  termId: string;
  onClose: () => void;
  /** It went through or was sent for checking: the toast to end on. */
  onDone: (message: string) => void;
}

/**
 * How to pay (TENANT-DASHBOARD-DESIGN §7.12, the prototype's `paysheet`, BIL-02, BIL-08): from the balance when it
 * covers the amount, else greyed with why; or by the platform's wallets, whose step opens in the sheet until Phase 5's
 * page. The request is made only on the tap that commits (BIL-09, decided 2026-10-23), with the amount the seller saw:
 * from the balance it is paid on that tap, by wallet the step follows it. A changed amount is said, nothing charged.
 */
export function HowToPaySheet({
  option,
  termId,
  onClose,
  onDone,
}: HowToPaySheetProps): React.JSX.Element {
  const { t, i18n } = useTranslation('money');
  const errorText = useErrorText();
  const balance = useBalance();
  const wallets = usePlatformWallets();
  const quote = useQuotePurchase();
  const confirm = useConfirmPurchase();
  const refreshPrices = useRefreshPrices();
  const shopAfterPayment = useShopAfterPayment();
  const [changed, setChanged] = useState<string | null>(null);
  const [opened, setOpened] = useState<PlanPayment | null>(null);

  const amount = changed ?? option.amount ?? option.price;
  const available = balance.data && !balance.data.frozen ? Number(balance.data.amount) : null;
  const enough = available !== null && available >= Number(amount);
  // The balance is the choice while it covers the amount, until the seller picks; a wallet when it does not.
  const [method, setMethod] = useState<'balance' | 'wallet' | null>(null);
  const chosen = enough ? (method ?? 'balance') : 'wallet';
  const names = walletNames(wallets.data ?? [], i18n.language);
  const failure = quote.error ?? confirm.error;
  const refusal = failure && changedAmount(failure) === null ? errorText(failure) : null;

  function commit(): void {
    setChanged(null);
    quote.mutate(
      { planId: option.planId, billingTermId: termId, amount: Number(amount) },
      {
        onSuccess: (request) => {
          if (chosen === 'wallet') {
            setOpened(request);
            return;
          }
          confirm.mutate(
            { paymentId: request.id, method: 'balance' },
            {
              onSuccess: () => {
                void shopAfterPayment().then((tenant) => {
                  const date = tenant?.periodEnd ? formatDayMonthYear(tenant.periodEnd) : '';
                  onDone(
                    option.move === 'renewal'
                      ? t('plPaid', { date })
                      : t('planOn', { plan: option.planName, date }),
                  );
                });
              },
            },
          );
        },
        onError: (error) => {
          const now = changedAmount(error);
          if (now === null) return;
          setChanged(now);
          refreshPrices();
        },
      },
    );
  }

  if (opened) {
    return (
      <Sheet open title={t('psTitle', { amount: taka(opened.amount) })} onClose={onClose}>
        <WalletStep
          amount={opened.amount}
          wallets={wallets.data}
          pending={confirm.isPending}
          error={confirm.isError ? errorText(confirm.error) : null}
          onSubmit={(values) => {
            confirm.mutate(
              { paymentId: opened.id, method: 'wallet', ...values },
              {
                onSuccess: () => {
                  onDone(t('sentForCheck'));
                },
              },
            );
          }}
        />
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      title={t('psTitle', { amount: taka(amount) })}
      onClose={onClose}
      footer={
        <Button tone="accent" busy={quote.isPending || confirm.isPending} onClick={commit}>
          {chosen === 'balance'
            ? t('payFromBalance', { amount: taka(amount) })
            : t('continueAmount', { amount: taka(amount) })}
        </Button>
      }
    >
      {changed ? (
        <Banner tone="warn">{t('amountChanged', { amount: taka(changed) })}</Banner>
      ) : null}
      <Card flush>
        <div role="radiogroup" className="flex flex-col [&>*+*]:border-t [&>*+*]:border-line">
          <button
            type="button"
            role="radio"
            aria-checked={chosen === 'balance'}
            aria-disabled={!enough}
            onClick={() => {
              if (enough) setMethod('balance');
            }}
            className={[
              'flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left',
              enough ? '' : 'cursor-default opacity-55',
            ].join(' ')}
          >
            <RadioMark on={chosen === 'balance'} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-medium">{t('psBalance')}</span>
              <span className="text-[14px] text-fg-muted">
                {available === null
                  ? t('psBalanceLow', { wallets: names })
                  : `${t('psBalanceHas', { amount: formatTakaExact(available) })}${
                      enough ? '' : ` · ${t('psBalanceLow', { wallets: names })}`
                    }`}
              </span>
            </span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={chosen === 'wallet'}
            onClick={() => {
              setMethod('wallet');
            }}
            className="flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left"
          >
            <RadioMark on={chosen === 'wallet'} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-medium">{t('psWallet', { wallets: names })}</span>
              <span className="truncate text-[14px] text-fg-muted">
                {walletProviders(wallets.data ?? []).join(' · ')}
              </span>
            </span>
          </button>
        </div>
      </Card>
      <WalletMarks wallets={wallets.data ?? []} />
      <p className="text-[14px] text-fg-muted">{t('psNote')}</p>
      {refusal ? <Banner tone="bad">{refusal}</Banner> : null}
    </Sheet>
  );
}
