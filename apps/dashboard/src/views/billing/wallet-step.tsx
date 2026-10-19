import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/notice';
import { TextField } from '@/components/ui/text-field';
import { formatTaka } from '@/lib/money';
import type { PlatformWallet } from '@/types/billing';

export interface WalletPaymentValues {
  transactionId: string;
  senderNumber: string;
  amountPaid: number;
}

interface WalletStepProps {
  /** The exact amount to send. */
  amount: string;
  wallets: PlatformWallet[] | undefined;
  pending: boolean;
  error: string | null;
  submitLabel: string;
  onSubmit: (values: WalletPaymentValues) => void;
  onBack?: () => void;
}

/**
 * The wallet step every paying sheet ends with (BIL-03, the Phase 2 stand-in for the hosted page): the
 * platform's numbers, then the sender number and the TrxID from the wallet's SMS. The amount is the quote's,
 * never retyped; a mismatch is the operator's call (BIL-06).
 */
export function WalletStep({
  amount,
  wallets,
  pending,
  error,
  submitLabel,
  onSubmit,
  onBack,
}: WalletStepProps): React.JSX.Element {
  const { t } = useTranslation();
  const [senderNumber, setSenderNumber] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (senderNumber.trim() === '' || transactionId.trim() === '') {
      setFormError(t('wallet.fillBoth'));
      return;
    }
    setFormError(null);
    onSubmit({
      senderNumber: senderNumber.trim(),
      transactionId: transactionId.trim(),
      amountPaid: Math.round(Number(amount)),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-baseline justify-between gap-3 text-[15px]">
        <span className="text-neutral-700">{t('wallet.sendExactly')}</span>
        <span className="num text-[22px] font-bold text-ink">{formatTaka(amount)}</span>
      </div>
      {wallets && wallets.length > 0 ? (
        <ul className="space-y-2">
          {wallets.map((wallet) => (
            <li
              key={wallet.id}
              className="num flex flex-wrap items-baseline gap-x-2 rounded-control border border-line-strong bg-white px-3.5 py-3 text-[15px]"
            >
              <span className="font-bold text-ink">{wallet.provider}</span>
              <span className="text-ink">{wallet.number}</span>
              {wallet.label ? <span className="text-neutral-700">{wallet.label}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-neutral-700">{t('checkout.noWalletsYet')}</p>
      )}
      <p className="rounded-control border-l-[3px] border-brand-500 bg-brand-50 px-3.5 py-2.5 text-[14px] text-brand-900">
        {t('wallet.howTo')}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label={t('wallet.senderNumber')}
          name="senderNumber"
          type="tel"
          inputMode="tel"
          placeholder="01XXXXXXXXX"
          value={senderNumber}
          onChange={(event) => {
            setSenderNumber(event.target.value);
          }}
        />
        <TextField
          label="TrxID"
          name="transactionId"
          autoCapitalize="characters"
          placeholder="9KL2M3"
          value={transactionId}
          onChange={(event) => {
            setTransactionId(event.target.value);
          }}
        />
      </div>
      {formError ? <ErrorBanner message={formError} /> : null}
      {error ? <ErrorBanner message={error} /> : null}
      <Button type="submit" tone="accent" loading={pending}>
        {submitLabel}
      </Button>
      {onBack ? (
        <Button type="button" tone="ghost" onClick={onBack}>
          {t('common.back')}
        </Button>
      ) : null}
    </form>
  );
}
