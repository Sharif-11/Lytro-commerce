import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { bangladeshiPhone } from '@/lib/phone';
import { walletColour } from '@/lib/wallet-marks';
import type { PlatformWallet } from '@/types/billing';

export interface WalletPaymentValues {
  transactionId: string;
  senderNumber: string;
  amountPaid: number;
}

interface WalletStepProps {
  /** The quote's amount, to send exactly. */
  amount: string;
  wallets: PlatformWallet[] | undefined;
  pending: boolean;
  /** The server's refusal, worded. */
  error: string | null;
  /** The button's words; the prototype's "Submit the payment" when left out. */
  submitLabel?: string;
  /** What a different amount waits for; the plan's start when left out. */
  amountNote?: string;
  onSubmit: (values: WalletPaymentValues) => void;
  onBack?: () => void;
  /** Inside an onboarding step, whose cards are roomier (the prototype's `.ob .card`); a sheet's are not. */
  spacious?: boolean;
}

/** One of the platform's numbers, with its wallet's mark and a Copy button (the prototype's checkout row). */
function WalletRow({ wallet }: { wallet: PlatformWallet }): React.JSX.Element {
  const { t } = useTranslation('wallet');
  const { copied, copy } = useCopyToClipboard();
  return (
    <div className="flex min-h-16 items-center gap-3 pt-2">
      <span
        className="flex size-10 flex-none items-center justify-center overflow-hidden rounded-[8px] border border-line bg-white text-[11px] font-bold text-fg-muted"
        style={{ color: walletColour(wallet.provider) }}
      >
        {wallet.provider}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="num text-[16px] font-medium">
          {bangladeshiPhone.grouped(wallet.number)}
        </span>
        <span className="truncate text-[14px] text-fg-muted">
          {wallet.label ? `${t('from')} · ${wallet.label}` : t('from')}
        </span>
      </span>
      <Button
        tone="outline"
        size="xs"
        onClick={() => {
          void copy(wallet.number);
        }}
      >
        {copied ? t('copied') : t('copy')}
      </Button>
    </div>
  );
}

/**
 * The wallet step every payment to Lytro ends with until Phase 5's hosted page (BIL-02, BIL-03; the prototype's
 * checkout): the platform's numbers to send the exact amount to, then the TrxID from the wallet's SMS, the number it
 * was sent from and the amount sent -- filled in with the quote's and changeable, since a different amount waits for
 * the operator's check rather than being hidden (BIL-06), which the field says.
 */
export function WalletStep({
  amount,
  wallets,
  pending,
  error,
  submitLabel,
  amountNote,
  onSubmit,
  onBack,
  spacious = false,
}: WalletStepProps): React.JSX.Element {
  const { t } = useTranslation('wallet');
  const [transactionId, setTransactionId] = useState('');
  const [localSender, setLocalSender] = useState('');
  const [amountSent, setAmountSent] = useState(Number(amount).toLocaleString('en-US'));
  const [formError, setFormError] = useState<string | null>(null);
  const [senderError, setSenderError] = useState<string | null>(null);

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const paid = Number(amountSent.replace(/[^\d.]/g, ''));
    if (transactionId.trim() === '' || localSender.trim() === '' || !(paid > 0)) {
      setFormError(t('fillAll'));
      return;
    }
    const sender = bangladeshiPhone.fromLocalPart(localSender);
    if (!bangladeshiPhone.isValid(sender)) {
      setFormError(null);
      setSenderError(t('invalidSender'));
      return;
    }
    setFormError(null);
    setSenderError(null);
    onSubmit({ transactionId: transactionId.trim(), senderNumber: sender, amountPaid: paid });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
      <div
        className={[
          'rounded-card border border-line bg-neutral-50',
          spacious ? 'flex flex-col gap-3.5 p-5' : 'p-4',
        ].join(' ')}
      >
        {wallets && wallets.length > 0 ? (
          <>
            <p className="text-[14px] text-fg-muted">{t('send', { a: formatTaka(amount) })}</p>
            {wallets.map((wallet) => (
              <WalletRow key={wallet.id} wallet={wallet} />
            ))}
          </>
        ) : (
          <p className="text-[14px] text-fg-muted">{t('noWallets')}</p>
        )}
      </div>
      <Field
        label={t('trx')}
        name="transactionId"
        placeholder="9F2KQ7X1"
        autoCapitalize="characters"
        autoComplete="off"
        value={transactionId}
        onChange={(event) => {
          setTransactionId(event.target.value);
        }}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label={t('sender')}
          name="senderNumber"
          type="tel"
          inputMode="numeric"
          prefix="+880"
          placeholder="1XXXXXXXXX"
          value={localSender}
          error={senderError}
          onChange={(event) => {
            setLocalSender(event.target.value.replace(/[^\d\s-]/g, ''));
            setSenderError(null);
          }}
        />
        <Field
          label={t('amount')}
          name="amountPaid"
          inputMode="decimal"
          prefix="৳"
          value={amountSent}
          help={amountNote ?? t('amountNote')}
          onChange={(event) => {
            setAmountSent(event.target.value.replace(/[^\d.,]/g, ''));
          }}
        />
      </div>
      {formError ? <Banner tone="bad">{formError}</Banner> : null}
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <Button type="submit" tone="accent" wide busy={pending}>
        {submitLabel ?? t('submit')}
      </Button>
      {onBack ? (
        <Button tone="ghost" onClick={onBack}>
          {t('back')}
        </Button>
      ) : null}
    </form>
  );
}
