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
