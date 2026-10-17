import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ErrorBanner } from '@/components/error-banner';
import { PlatformWalletList } from '@/components/platform-wallet-list';
import type { PlanPayment } from '@/types/plan-payment';
import type { PlatformWallet } from '@/types/balance';

export interface ConfirmWalletValues {
  transactionId: string;
  senderNumber: string;
  amountPaid: number;
}

interface PaymentPanelProps {
  title: string;
  quote: PlanPayment;
  onConfirmBalance: () => void;
  onConfirmWallet: (values: ConfirmWalletValues) => void;
  onCancel: () => void;
  balancePending: boolean;
  walletPending: boolean;
  error: string | null;
  wallets: PlatformWallet[] | undefined;
}

/** BIL-02/08/16: the shared "pay from balance, or submit a wallet payment" step, once a purchase or upgrade
    has been quoted — same two-method shape as a top-up's own confirm step (TopUpForm), just offering balance
    as a second option here since a purchase/upgrade (unlike a top-up) can legitimately be paid that way. */
export function PaymentPanel({
  title,
  quote,
  onConfirmBalance,
  onConfirmWallet,
  onCancel,
  balancePending,
  walletPending,
  error,
  wallets,
}: PaymentPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const [transactionId, setTransactionId] = useState('');
  const [senderNumber, setSenderNumber] = useState('');
  const [amountPaid, setAmountPaid] = useState('');

  function handleWalletSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const paid = Number(amountPaid);
    if (!Number.isFinite(paid) || paid <= 0) return;
    onConfirmWallet({ transactionId, senderNumber, amountPaid: paid });
  }

  return (
    <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="text-2xl font-bold text-slate-900">{quote.amount} TK</p>

      {error ? <ErrorBanner message={error} /> : null}

      <Button type="button" loading={balancePending} onClick={onConfirmBalance} className="w-auto!">
        {t('billing.payFromBalance')}
      </Button>

      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-100" />
        {t('billing.or')}
        <span className="h-px flex-1 bg-slate-100" />
      </div>

      <form onSubmit={handleWalletSubmit} className="space-y-4">
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
        <div className="flex gap-2">
          <Button
            type="submit"
            variant="outline"
            loading={walletPending}
            className="w-auto! flex-1 sm:flex-none"
          >
            {t('billing.payByWallet')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            className="w-auto! flex-1 sm:flex-none"
          >
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </div>
  );
}
