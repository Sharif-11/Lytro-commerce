import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { RateKey } from '@lytronix/validators';
import { useConfirmTopUp, useQuoteTopUp } from '@/api/balance';
import { usePlatformWallets } from '@/api/billing';
import { errorMessage } from '@lytronix/api-client';
import { Button, Chip, ErrorBanner, formatTaka, Icon } from '@lytronix/ui';
import { Sheet, Stepper } from '@/components/ui/sheet';
import type { RateValue } from '@/types/balance';
import type { PlanPayment } from '@/types/billing';
import { WalletStep } from '@/components/wallet-step';

const QUICK_AMOUNTS = [200, 500, 1000, 2000];

interface TopUpSheetProps {
  open: boolean;
  rates: RateValue[] | undefined;
  onClose: () => void;
  onSubmitted: (amount: string) => void;
}

/** BAL-03/04 in three steps: the amount with quick picks and what it buys at today's rates, the wallet step,
    then "being checked". The bounds come back from a refused quote until GET /balance carries them. */
export function TopUpSheet({
  open,
  rates,
  onClose,
  onSubmitted,
}: TopUpSheetProps): React.JSX.Element {
  const { t } = useTranslation();
  const wallets = usePlatformWallets();
  const quote = useQuoteTopUp();
  const confirm = useConfirmTopUp();
  const [amount, setAmount] = useState('500');
  const [payment, setPayment] = useState<PlanPayment | null>(null);
  const [done, setDone] = useState(false);

  const smsRate = Number(rates?.find((rate) => rate.key === RateKey.SmsPerUnit)?.value ?? NaN);
  const aiRate = Number(rates?.find((rate) => rate.key === RateKey.AiReply)?.value ?? NaN);
  const numeric = Number(amount);
  const buys =
    Number.isFinite(numeric) && numeric > 0 && Number.isFinite(smsRate) && smsRate > 0 && aiRate > 0
      ? { sms: Math.floor(numeric / smsRate), ai: Math.floor(numeric / aiRate) }
      : null;

  function reset(): void {
    setAmount('500');
    setPayment(null);
    setDone(false);
    quote.reset();
    confirm.reset();
  }

  function close(): void {
    onClose();
    reset();
  }

  function handleQuote(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    quote.mutate({ amount: numeric }, { onSuccess: setPayment });
  }

  const step = done ? 2 : payment ? 1 : 0;

  return (
    <Sheet open={open} title={t('balance.topUp')} onClose={close}>
      <Stepper steps={3} current={step} />

      {step === 0 ? (
        <form onSubmit={handleQuote} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[14px] font-bold text-ink">
              {t('balance.howMuch')}
            </span>
            <input
              name="amount"
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value.replace(/[^\d]/g, ''));
              }}
              className="num min-h-14 w-full rounded-control border border-neutral-200 bg-white px-3.5 text-center text-[26px] font-bold text-ink focus:border-brand-700 focus:ring-2 focus:ring-brand-500/25 focus:outline-none"
            />
            <span className="mt-1.5 block text-[13px] text-neutral-700">
              {t('balance.boundsHint')}
            </span>
          </label>
          <div className="grid grid-cols-4 gap-2">
            {QUICK_AMOUNTS.map((quick) => (
              <Chip
                key={quick}
                selected={numeric === quick}
                className="num justify-center px-2!"
                onClick={() => {
                  setAmount(String(quick));
                }}
              >
                {formatTaka(quick)}
              </Chip>
            ))}
          </div>
          {buys ? (
            <p className="rounded-control border-l-[3px] border-brand-500 bg-brand-50 px-3.5 py-2.5 text-[14px] text-brand-900">
              {t('balance.buys', { amount: formatTaka(numeric), sms: buys.sms, ai: buys.ai })}
            </p>
          ) : null}
          {quote.isError ? <ErrorBanner message={errorMessage(quote.error, t)} /> : null}
          <Button type="submit" tone="accent" loading={quote.isPending}>
            {t('common.continue')}
          </Button>
        </form>
      ) : null}

      {step === 1 && payment ? (
        <WalletStep
          amount={payment.amount}
          wallets={wallets.data}
          pending={confirm.isPending}
          error={confirm.isError ? errorMessage(confirm.error, t) : null}
          submitLabel={t('balance.iHaveSent', { amount: formatTaka(payment.amount) })}
          onSubmit={(values) => {
            confirm.mutate(
              { paymentId: payment.id, ...values },
              {
                onSuccess: () => {
                  setDone(true);
                  onSubmitted(payment.amount);
                },
              },
            );
          }}
          onBack={() => {
            setPayment(null);
            quote.reset();
          }}
        />
      ) : null}

      {step === 2 && payment ? (
        <div className="space-y-5 py-4 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-[16px] bg-brand-50 text-brand-700">
            <Icon name="check" size={28} />
          </span>
          <div>
            <h3 className="text-[17px] font-bold text-ink">
              {t('balance.beingChecked', { amount: formatTaka(payment.amount) })}
            </h3>
            <p className="mt-1 text-[14px] text-neutral-700">{t('balance.pendingTopUpNote')}</p>
          </div>
          <Button type="button" onClick={close}>
            {t('common.done')}
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}
