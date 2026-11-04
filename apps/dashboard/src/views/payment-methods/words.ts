import {
  PaymentMethod,
  WalletAccountType,
  type AccountMethod,
  type PaymentAccountInput,
} from '@lytronix/validators';
import type { TFunction } from 'i18next';
import { bangladeshiPhone } from '@/lib/phone';
import type { PaymentAccount } from '@/types/payment-methods';

/** A method's own name: the wallets' are brands, a bank transfer's is words. */
export function methodName(method: AccountMethod, t: TFunction<'menu'>): string {
  switch (method) {
    case PaymentMethod.Bkash:
      return 'bKash';
    case PaymentMethod.Nagad:
      return 'Nagad';
    case PaymentMethod.Rocket:
      return 'Rocket';
    case PaymentMethod.Upay:
      return 'Upay';
    case PaymentMethod.Bank:
      return t('pmBank');
  }
}

/** What an account is called on the page: its wallet number grouped, or its bank account number. */
export function accountNumberOf(account: PaymentAccount): string {
  return account.number === null
    ? (account.accountNumber ?? '')
    : bangladeshiPhone.grouped(account.number);
}

export function typeWord(type: WalletAccountType | null, t: TFunction<'menu'>): string {
  switch (type) {
    case WalletAccountType.Agent:
      return t('pmTypeAgent');
    case WalletAccountType.Merchant:
      return t('pmTypeMerchant');
    case WalletAccountType.Personal:
    case null:
      return t('pmTypePersonal');
  }
}

/** An account as the server takes it back: every save sends the method's whole list (WAL-01). */
export function bodyOf(account: PaymentAccount): PaymentAccountInput {
  const shared = { id: account.id, accountName: account.accountName, active: account.active };
  if (account.number !== null) {
    return {
      ...shared,
      number: account.number,
      accountType: account.accountType ?? WalletAccountType.Personal,
      note: account.note ?? undefined,
    };
  }
  return {
    ...shared,
    bankName: account.bankName ?? '',
    accountNumber: account.accountNumber ?? '',
    branch: account.branch ?? undefined,
    routingNumber: account.routingNumber ?? undefined,
    swiftCode: account.swiftCode ?? undefined,
    instructions: account.instructions ?? undefined,
  };
}
