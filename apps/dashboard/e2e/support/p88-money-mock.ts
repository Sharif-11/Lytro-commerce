import type { PaymentFixture } from './payments';

// ADM-17, D8-15 (Slice 8.8, Part 39's `p88-bl-shot*`): a payment's screenshot sent from Billing. The upload's link points
// at the page's own origin, where mockApi answers every `/__upload/` with 200; a test that wants it to fail routes it.

/** Where the mocked store takes a screenshot's file. */
export const SHOT_UPLOAD_PATH = '/__upload/evidence-shot';

const KEY = 'evidence/7d0a51f3-4c6e-4f8f-9a35-2b1e6c0f4a11/0b6f2d8e-3a5c-4e7b-8f1d-9c2a4b6e8d10';

type Answer =
  { data: unknown } | { refused: { status: number; code: string; message: string } } | undefined;

/**
 * The upload's link (`POST /billing/payment-evidence`, `POST /balance/top-up/evidence`), then the screenshot put on the
 * payment (`POST /billing/payments/:id/evidence`, `POST /balance/top-up/:id/evidence`): the list read after it says when
 * it was sent, and a second is refused as the server refuses it.
 */
export function screenshotAnswer(method: string, path: string, payments: PaymentFixture[]): Answer {
  if (method !== 'POST') return undefined;
  if (path === '/billing/payment-evidence' || path === '/balance/top-up/evidence') {
    return {
      data: {
        key: KEY,
        upload: {
          url: SHOT_UPLOAD_PATH,
          method: 'PUT',
          headers: {},
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
      },
    };
  }
  const attach = /^\/(?:billing\/payments|balance\/top-up)\/([^/]+)\/evidence$/.exec(path);
  if (!attach) return undefined;
  const at = payments.findIndex((each) => each.id === attach[1]);
  const payment = payments[at];
  if (!payment) {
    return { refused: { status: 404, code: 'not_found', message: 'Payment not found.' } };
  }
  if (payment['evidenceSentAt']) {
    return {
      refused: {
        status: 409,
        code: 'conflict',
        message: 'A screenshot was already sent for this payment. Once sent, it stays.',
      },
    };
  }
  const evidenceSentAt = new Date().toISOString();
  // A copy in the list: the drawn payments are shared by every test in the run.
  payments[at] = { ...payment, evidenceSentAt };
  return { data: { evidenceSentAt } };
}
