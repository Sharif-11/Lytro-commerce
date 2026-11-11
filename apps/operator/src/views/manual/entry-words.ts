import { useTranslation } from 'react-i18next';
import { usePaymentMethods } from '@/api/payment-methods';
import { usePlatformWallets } from '@/api/platform-wallets';
import type { ManualEntry } from '@/types/manual-entries';
import type { LytroBankAccount, PlatformWallet } from '@/types/operator';

/** The filters' grid: two to a row on a phone, one row from 640 px. */
export const FILTERS = 'grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]';

/** A filter's control. */
export const PICK_CONTROL =
  'h-10 w-full min-w-0 rounded-control border border-control-line bg-field px-3 text-input text-fg focus:border-line-active focus:ring-2 focus:ring-field-ring focus:outline-none sm:text-[14px]';

/** Lytro's number as the console writes it: bKash · 01711 000000. */
export function walletLabel(wallet: PlatformWallet): string {
  return `${wallet.provider} · ${wallet.number}`;
}

/** Lytro's bank account, short: BRAC Bank · 1501 2045 6789 001. */
export function bankLabel(account: LytroBankAccount, withBranch = false): string {
  return [account.bankName, withBranch ? account.branch : null, account.accountNumber]
    .filter((part) => part !== null && part !== '')
    .join(' · ');
}

/** Where an entry's money arrived, in words, from Lytro's numbers and bank accounts. */
export function usePaidTo(): (entry: ManualEntry | undefined) => string {
  const wallets = usePlatformWallets();
  const methods = usePaymentMethods();
  return (entry) => {
    if (!entry) return '—';
    if (entry.bankAccountId !== null) {
      const account = methods.data?.bankAccounts.find((each) => each.id === entry.bankAccountId);
      return account ? bankLabel(account) : '—';
    }
    const wallet = wallets.data?.find((each) => each.id === entry.walletId);
    return wallet ? walletLabel(wallet) : '—';
  };
}

/** An entry's kind and plan: "Renewal · Starter". */
export function useEntryWhat(): (entry: ManualEntry) => string {
  const { t } = useTranslation();
  return (entry) =>
    `${t(`paymentKinds.${entry.kind}`)}${entry.planName ? ` · ${entry.planName}` : ''}`;
}

// D8-47: a screenshot is kept two years, then removed.
const SHOT_KEPT_MS = 2 * 365 * 24 * 60 * 60 * 1000;

/** Whether an entry's screenshot has passed its two years. */
export function shotGone(entry: ManualEntry, now = Date.now()): boolean {
  return now - new Date(entry.createdAt).getTime() > SHOT_KEPT_MS;
}
