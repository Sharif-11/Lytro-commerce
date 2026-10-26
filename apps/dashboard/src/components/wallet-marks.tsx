import { walletColour, walletProviders } from '@/lib/wallet-marks';
import type { PlatformWallet } from '@/types/billing';

// The wallets whose own logo the sketch shows (docs/brand/third-party, scaled to 72 px high for the dashboard); any
// other is its name in its colour, as the sketch writes Rocket and Upay.
const LOGOS: Record<string, string> = {
  bkash: '/third-party/bkash.png',
  nagad: '/third-party/nagad.png',
};

/**
 * The platform's wallets as a row of marks (the prototype's `.wl`): what a payment to Lytro can be sent by, under the
 * choice that sends it. Phase 5's page draws all four; until then they are the platform's own (decided for 11.5b).
 */
export function WalletMarks({
  wallets,
}: {
  wallets: readonly PlatformWallet[];
}): React.JSX.Element | null {
  const providers = walletProviders(wallets);
  if (providers.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {providers.map((provider) => {
        const logo = LOGOS[provider.toLowerCase()];
        return (
          <span
            key={provider}
            className="inline-flex h-9 min-w-16 items-center justify-center rounded-[8px] border border-line bg-white px-2.5 text-[13px] font-bold text-fg-muted"
            style={logo ? undefined : { color: walletColour(provider) }}
          >
            {logo ? (
              <img src={logo} alt={provider} className="block max-h-[18px] max-w-[52px]" />
            ) : (
              provider
            )}
          </span>
        );
      })}
    </div>
  );
}
