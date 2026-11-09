/** The wallets a platform number can be on, with the dot each is drawn with. */
export const WALLET_PROVIDERS: readonly string[] = ['bKash', 'Nagad', 'Rocket', 'Upay'];

const COLOURS: Record<string, string> = {
  bKash: '#CF2772',
  Nagad: '#D71E22',
  Rocket: '#892C8C',
  Upay: '#1F4E98',
};

/** A method's name as a number's provider is written; a bank has none. */
export const METHOD_NAMES: Readonly<Record<string, string>> = {
  bkash: 'bKash',
  nagad: 'Nagad',
  rocket: 'Rocket',
  upay: 'Upay',
};

export function providerColour(provider: string): string {
  return COLOURS[provider] ?? '#888888';
}
