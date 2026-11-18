import { PaymentMethod } from '@lytronix/validators/enums';

/** The wallets' own names, which no language changes (checkout's chooser, the home's trust strip). */
export const WALLET_NAMES: Readonly<Partial<Record<PaymentMethod, string>>> = {
  [PaymentMethod.Bkash]: 'bKash',
  [PaymentMethod.Nagad]: 'Nagad',
  [PaymentMethod.Rocket]: 'Rocket',
  [PaymentMethod.Upay]: 'Upay',
};
