import { useTranslation } from 'react-i18next';
import { PaymentMethod } from '@lytronix/validators';
import type { WalletType } from '@/types/manual-entries';
import { METHOD_NAMES } from '@/views/wallets/providers';

/** A payment method type's name: bKash, or Bank transfer in the console's language. */
export function useTypeName(): (type: WalletType) => string {
  const { t } = useTranslation();
  return (type) =>
    type.method === PaymentMethod.Bank
      ? t('walletTypes.bank')
      : (METHOD_NAMES[type.method] ?? type.method);
}

/** D8-67: what keeps a retiring type from being removed: a shop with it on, a payment open on it, Lytro's own page. */
export function holdsType(type: WalletType): boolean {
  return type.shopsOn > 0 || type.openPayments > 0 || type.lytroTakes;
}
