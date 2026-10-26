import { formatTakaExact } from '@lytronix/ui';

/** An amount in a line of text, its sign first, as the prototype writes it: "−৳85.85", "৳412.50". */
export function signedTaka(amount: string | number): string {
  const value = Number(amount);
  return `${value < 0 ? '−' : ''}${formatTakaExact(Math.abs(value))}`;
}
