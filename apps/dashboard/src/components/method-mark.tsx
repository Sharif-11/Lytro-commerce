import { PaymentMethod } from '@lytronix/validators';
import { Icon } from '@/components/icon';
import { walletColour } from '@/lib/wallet-marks';

// The wallets whose own logo the sketch shows; Rocket and Upay are their names in their colours, as the payment page writes them.
const LOGOS: Partial<Record<PaymentMethod, string>> = {
  [PaymentMethod.Bkash]: '/third-party/bkash.png',
  [PaymentMethod.Nagad]: '/third-party/nagad.png',
};

const NAMED: readonly PaymentMethod[] = [PaymentMethod.Rocket, PaymentMethod.Upay];

/** How money comes, as a row's lead (the prototype's `pm33Mark`): a wallet's mark, or an icon for what has none. */
export function MethodMark({
  method,
  name,
}: {
  method: PaymentMethod;
  name: string;
}): React.JSX.Element {
  const logo = LOGOS[method];
  return (
    <span className="flex size-10 flex-none items-center justify-center overflow-hidden rounded-button border border-line bg-white p-[3px]">
      {logo ? (
        <img src={logo} alt={name} className="size-full object-contain" />
      ) : NAMED.includes(method) ? (
        <span className="text-[11px] font-bold" style={{ color: walletColour(method) }}>
          {name}
        </span>
      ) : (
        <span className="flex text-fg-muted">
          <Icon name={method === PaymentMethod.CashOnDelivery ? 'truck' : 'banknote'} />
        </span>
      )}
    </span>
  );
}
