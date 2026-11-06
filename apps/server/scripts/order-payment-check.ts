import { nodeSend, OrderPaymentCheck } from './lib/order-payment-check';

// OBS-08 (Phase 5's milestone; monitored probes are Phase 9's): the scripted order-and-payment check, run from outside the
// servers against a demonstration shop. It places an order needing an advance, as a shop's website would, opens the order's
// payment page, follows bKash's checkout as far as its address when the shop takes bKash there, and reads the order's
// tracking. It moves no money: the order lapses with its window ("advance not paid"). Run it, with the settings below in
// the environment, as:
//   pnpm --filter @lytronix/server exec tsx scripts/order-payment-check.ts
// It prints each step and exits 1 on the first that fails. Settings:
//   LYTRO_CHECK_API       the public API's address, e.g. https://api.staging.lytro.app
//   LYTRO_CHECK_HOST      a Host header to send instead of the address's own (optional)
//   LYTRO_CHECK_KEY       the demonstration shop's website key
//   LYTRO_CHECK_ORIGIN    a website the key names, e.g. https://demo.example.com
//   LYTRO_CHECK_VARIANT   a variant needing an advance, in stock
//   LYTRO_CHECK_LOCATION  a thana the shop delivers to
//   LYTRO_CHECK_PHONE     the shopper's mobile number the orders are placed under
//   LYTRO_CHECK_METHOD    the wallet to pay by (default bkash)

function setting(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`${name} is not set; see the top of scripts/order-payment-check.ts`);
  return value;
}

async function main(): Promise<void> {
  const check = new OrderPaymentCheck(
    {
      api: setting('LYTRO_CHECK_API'),
      host: process.env['LYTRO_CHECK_HOST'],
      key: setting('LYTRO_CHECK_KEY'),
      origin: setting('LYTRO_CHECK_ORIGIN'),
      variantId: setting('LYTRO_CHECK_VARIANT'),
      locationId: Number(setting('LYTRO_CHECK_LOCATION')),
      phone: setting('LYTRO_CHECK_PHONE'),
      method: setting('LYTRO_CHECK_METHOD', 'bkash'),
    },
    nodeSend,
  );
  const result = await check.run();
  for (const each of result.steps) {
    console.log(
      `${each.ok ? 'ok  ' : 'FAIL'} ${each.name} (${String(each.ms)} ms): ${each.detail}`,
    );
  }
  process.exitCode = result.ok ? 0 : 1;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
