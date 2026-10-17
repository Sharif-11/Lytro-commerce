import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ErrorBanner } from '@/components/error-banner';
import { PlatformWalletList } from '@/components/platform-wallet-list';
import type { PlanPayment } from '@/types/plan-payment';
import type { PlatformWallet } from '@/types/balance';

export interface ConfirmTopUpValues {
  transactionId: string;
  senderNumber: string;
  amountPaid: number;
}

interface TopUpFormProps {
  /** Null until a quote exists -- the amount step; once set, the form shows the wallet-payment step
      instead (BIL-09's quote-then-pay shape, reused here for BAL-03). */
  quote: PlanPayment | null;
  submitted: boolean;
  onQuote: (amount: number) => void;
  onConfirm: (values: ConfirmTopUpValues) => void;
  onCancelQuote: () => void;
  quotePending: boolean;
  confirmPending: boolean;
  error: string | null;
  wallets: PlatformWallet[] | undefined;
}

/** Presentational (ENGINEERING-STANDARDS.md §2a): two steps in one card, switched on whether `quote` is
    set, never fetches or holds anything the container doesn't already own. */
export function TopUpForm({
  quote,
  submitted,
  onQuote,
  onConfirm,
  onCancelQuote,
  quotePending,
  confirmPending,
  error,
  wallets,
}: TopUpFormProps): React.JSX.Element {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [senderNumber, setSenderNumber] = useState('');
  const [amountPaid, setAmountPaid] = useState('');

  function handleQuoteSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    onQuote(value);
  }

  function handleConfirmSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const paid = Number(amountPaid);
    if (!Number.isFinite(paid) || paid <= 0) return;
    onConfirm({ transactionId, senderNumber, amountPaid: paid });
  }

  if (quote) {
    return (
      <form
        onSubmit={handleConfirmSubmit}
        className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-5"
      >
        <h2 className="text-base font-semibold text-slate-900">
          {t('balance.quoted', { amount: quote.amount })}
        </h2>

        <PlatformWalletList wallets={wallets} />

        <TextField
          label={t('balance.transactionId')}
          name="transactionId"
          required
          value={transactionId}
          onChange={(event) => {
            setTransactionId(event.target.value);
          }}
        />
        <TextField
          label={t('balance.senderNumber')}
          name="senderNumber"
          required
          value={senderNumber}
          onChange={(event) => {
            setSenderNumber(event.target.value);
          }}
        />
        <TextField
          label={t('balance.amountPaid')}
          name="amountPaid"
          type="number"
          min="0"
          step="0.01"
          required
          value={amountPaid}
          onChange={(event) => {
            setAmountPaid(event.target.value);
          }}
        />

        {error ? <ErrorBanner message={error} /> : null}

        <div className="flex gap-2">
          <Button type="submit" loading={confirmPending} className="w-auto! flex-1 sm:flex-none">
            {t('balance.submit')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancelQuote}
            className="w-auto! flex-1 sm:flex-none"
          >
            {t('balance.cancelQuote')}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleQuoteSubmit}
      className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-5"
    >
      <h2 className="text-base font-semibold text-slate-900">{t('balance.topUp')}</h2>

      <TextField
        label={t('balance.amount')}
        name="amount"
        type="number"
        min="0"
        step="0.01"
        required
        value={amount}
        onChange={(event) => {
          setAmount(event.target.value);
        }}
      />

      {error ? <ErrorBanner message={error} /> : null}
      {submitted ? (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {t('balance.submitted')}
        </p>
      ) : null}

      <Button type="submit" loading={quotePending} className="w-auto!">
        {t('balance.quote')}
      </Button>
    </form>
  );
}
