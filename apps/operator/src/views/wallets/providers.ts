/** The wallets a platform number can be on, with the dot each is drawn with. */
export const WALLET_PROVIDERS: readonly string[] = ['bKash', 'Nagad', 'Rocket', 'Upay'];

const COLOURS: Record<string, string> = {
  bKash: '#CF2772',
  Nagad: '#D71E22',
  Rocket: '#892C8C',
  Upay: '#1F4E98',
};

export function providerColour(provider: string): string {
  return COLOURS[provider] ?? '#888888';
}
