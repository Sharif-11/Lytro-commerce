/** MED-12 (Slice 8.8): a US dollar amount as the console shows Cloudflare's prices and costs, two decimals: $4.50. */
export function usd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
