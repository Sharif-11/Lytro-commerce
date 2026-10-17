import { useTranslation } from 'react-i18next';
import type { PlatformWallet } from '@/types/balance';

/** BIL-02/BAL-03: "where to send money", shown just above the transaction-id/sender-number fields in both
    TopUpForm and PaymentPanel, so the tenant knows the destination before typing in what they already sent.
    Renders nothing while the wallet list is empty or hasn't loaded yet, rather than an empty box. */
export function PlatformWalletList({
  wallets,
}: {
  wallets: PlatformWallet[] | undefined;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  if (!wallets || wallets.length === 0) return null;

  return (
    <div className="space-y-2 rounded-xl bg-slate-50 p-3">
      <p className="text-sm font-medium text-slate-700">{t('balance.sendPaymentTo')}</p>
      <ul className="space-y-1">
        {wallets.map((wallet) => (
          <li key={wallet.id} className="text-sm text-slate-600">
            <span className="font-medium text-slate-900">{wallet.provider}</span>
            {' — '}
            <span className="font-mono">{wallet.number}</span>
            {wallet.label ? <span className="text-slate-400"> ({wallet.label})</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
