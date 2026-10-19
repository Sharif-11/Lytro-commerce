import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ErrorBanner, formatTaka, TextField } from '@lytronix/ui';
import type { PlanPayment, PlatformWallet } from '@/types/billing';

export interface WalletPaymentValues {
  transactionId: string;
  senderNumber: string;
  amountPaid: number;
}

interface PaymentFormProps {
  quote: PlanPayment;
  wallets: PlatformWallet[] | undefined;
  pending: boolean;
  error: string | null;
  onSubmit: (values: WalletPaymentValues) => void;
  /** BIL-02: paying from the shop's balance, offered where the balance can cover it (never at sign-up,
      where the balance is empty). */
  balance?: { amount: string; onPay: () => void; pending: boolean };
}

/** The wallet payment step (BIL-02, the Phase 2 stand-in for the hosted page): send the amount to one of the
    platform's numbers, then enter the transaction ID, the sender number and the amount. */
export function PaymentForm({
  quote,
  wallets,
  pending,
  error,
  onSubmit,
  balance,
}: PaymentFormProps): React.JSX.Element {
  const { t } = useTranslation();
  const [transactionId, setTransactionId] = useState('');
  const [senderNumber, setSenderNumber] = useState('');
  const [amountPaid, setAmountPaid] = useState(String(Math.round(Number(quote.amount))));
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const paid = Number(amountPaid);
    if (
      transactionId.trim() === '' ||
      senderNumber.trim() === '' ||
      !Number.isFinite(paid) ||
      paid <= 0
    ) {
      setFormError(t('checkout.fillAllFields'));
      return;
    }
    setFormError(null);
    onSubmit({
      transactionId: transactionId.trim(),
      senderNumber: senderNumber.trim(),
      amountPaid: paid,
    });
  }

  const canPayFromBalance = balance !== undefined && Number(balance.amount) >= Number(quote.amount);

  return (
    <div className="space-y-4">
      {balance ? (
        <div className="rounded-card border border-line bg-neutral-50 p-4">
          <p className="num text-[14px] text-neutral-700">
            {t('checkout.balanceLine', { balance: formatTaka(balance.amount) })}
          </p>
          <div className="mt-3">
            <Button
              type="button"
              tone="primary"
              loading={balance.pending}
              disabled={!canPayFromBalance}
              onClick={balance.onPay}
            >
              {t('checkout.payFromBalance', { amount: formatTaka(quote.amount) })}
            </Button>
          </div>
          {!canPayFromBalance ? (
            <p className="mt-2 text-[13px] text-neutral-700">{t('checkout.balanceTooLow')}</p>
          ) : null}
          <div className="my-4 flex items-center gap-3 text-[13px] font-semibold text-neutral-700">
            <span className="h-px flex-1 bg-line-strong" />
            {t('signIn.or')}
            <span className="h-px flex-1 bg-line-strong" />
          </div>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-card border border-line bg-white p-4">
          <p className="text-[14px] font-bold text-ink">
            {t('checkout.sendAmount', { amount: formatTaka(quote.amount) })}
          </p>
          {wallets && wallets.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {wallets.map((wallet) => (
                <li
                  key={wallet.id}
                  className="num flex flex-wrap items-baseline gap-x-2 text-[15px]"
                >
                  <span className="font-semibold text-ink">{wallet.provider}</span>
                  <span className="text-ink">{wallet.number}</span>
                  {wallet.label ? <span className="text-neutral-700">({wallet.label})</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[14px] text-neutral-700">{t('checkout.noWalletsYet')}</p>
          )}
        </div>

        <TextField
          label={t('checkout.transactionId')}
          name="transactionId"
          autoCapitalize="characters"
          value={transactionId}
          onChange={(event) => {
            setTransactionId(event.target.value);
          }}
        />
        <TextField
          label={t('checkout.senderNumber')}
          name="senderNumber"
          type="tel"
          inputMode="tel"
          value={senderNumber}
          onChange={(event) => {
            setSenderNumber(event.target.value);
          }}
        />
        <TextField
          label={t('checkout.amountPaid')}
          name="amountPaid"
          type="number"
          inputMode="decimal"
          min="1"
          step="1"
          value={amountPaid}
          onChange={(event) => {
            setAmountPaid(event.target.value);
          }}
        />
        {formError ? <ErrorBanner message={formError} /> : null}
        {error ? <ErrorBanner message={error} /> : null}
        <Button type="submit" tone="accent" loading={pending}>
          {t('checkout.submitPayment')}
        </Button>
      </form>
    </div>
  );
}
