import type { PlatformWallet } from '@/types/billing';

// The colour each wallet's name is written in on its mark, as the prototype draws them (bKash's pink, Nagad's
// orange, Rocket's purple, Upay's blue). A platform wallet's provider is free text the operator types, so the match is
// on the lowercased name; any other provider is written in the muted text colour.
const WALLET_COLOURS: Record<string, string> = {
  bkash: '#e2136e',
  nagad: '#f6921e',
  rocket: '#7b2cbf',
  upay: '#1f4e98',
};

export function walletColour(provider: string): string | undefined {
  return WALLET_COLOURS[provider.trim().toLowerCase()];
}

/** Each wallet the platform takes payments by, once, in the order the operator lists them. */
export function walletProviders(wallets: readonly PlatformWallet[]): string[] {
  return [...new Set(wallets.map((wallet) => wallet.provider.trim()))];
}

/** The wallets as a choice names them: "bKash or Nagad", "bKash বা Nagad". */
export function walletNames(wallets: readonly PlatformWallet[], language: string): string {
  return new Intl.ListFormat(language === 'bn' ? 'bn' : 'en-GB', { type: 'disjunction' }).format(
    walletProviders(wallets),
  );
}
