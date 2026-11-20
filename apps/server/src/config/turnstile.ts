// Cloudflare's published Turnstile test secrets (developers.cloudflare.com/turnstile/troubleshooting/testing/): with
// one, Siteverify answers alike for every token from any page, `hostname` example.com and no action. The tests use them;
// a production server refuses them (env.ts), since they would raise the per-address limits with no check behind them.
export const TURNSTILE_TEST_SECRETS = {
  passes: '1x0000000000000000000000000000000AA',
  fails: '2x0000000000000000000000000000000AA',
  spent: '3x0000000000000000000000000000000AA',
} as const;

export function isTurnstileTestSecret(secret: string): boolean {
  return (Object.values(TURNSTILE_TEST_SECRETS) as string[]).includes(secret);
}
