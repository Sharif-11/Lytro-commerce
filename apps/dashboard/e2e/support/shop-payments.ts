// The shop's incoming payments and listener phones as Part 35 draws them (docs/brand/lytro-dashboard.html). Dates count back from
// now, so the day groups read today and yesterday whenever the test runs.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ago = (ms: number): string => new Date(Date.now() - ms).toISOString();

export interface ShopPaymentRow {
  id: string;
  kind: 'session' | 'payment';
  status: string;
  order: { id: string; orderNumber: string };
  method: string;
  amount: string;
  senderNumber: string | null;
  transactionId: string | null;
  at: string;
  source: string | null;
  verificationLevel: string | null;
  decidedBy: { id: string; name: string } | null;
  decidedAt: string | null;
  rejectReason: string | null;
  note: string | null;
  test: boolean;
  reviewReason: string | null;
  receipt: { amount: string; senderNumber: string | null; receivedAt: string } | null;
}

/** A payment waiting for staff, everything not given empty. */
export function waiting(given: Partial<ShopPaymentRow> & { id: string }): ShopPaymentRow {
  return {
    kind: 'session',
    status: 'to_verify',
    order: { id: `order-${given.id}`, orderNumber: '261105-0040' },
    method: 'bkash',
    amount: '500.00',
    senderNumber: '+8801712000111',
    transactionId: '8HC3P2M1',
    at: ago(HOUR),
    source: 'checkout',
    verificationLevel: null,
    decidedBy: null,
    decidedAt: null,
    rejectReason: null,
    note: null,
    test: false,
    reviewReason: null,
    receipt: null,
    ...given,
  };
}

/** A payment settled, on its order. */
export function settled(given: Partial<ShopPaymentRow> & { id: string }): ShopPaymentRow {
  return waiting({
    kind: 'payment',
    status: 'verified',
    verificationLevel: 'listener',
    decidedAt: ago(HOUR),
    ...given,
  });
}

export interface PhoneReceiptRow {
  id: string;
  sender: string;
  method: string | null;
  amount: string | null;
  transactionId: string | null;
  status: string;
  reviewReason: string | null;
  ignoredReason: string | null;
  orderNumber: string | null;
  receivedAt: string;
  senderNumber: string | null;
  deviceId: string | null;
  text: string | null;
}

export interface ListenerPhoneRow {
  id: string;
  name: string;
  model: string | null;
  appVersion: string | null;
  pairedAt: string;
  lastSeenAt: string | null;
  online: boolean;
  status: string;
  revokedAt: string | null;
  revokeReason: string | null;
  flags: number;
  uploadsToday: number;
}

export function phone(given: Partial<ListenerPhoneRow> & { id: string }): ListenerPhoneRow {
  return {
    name: "Rumana's phone",
    model: 'Xiaomi Redmi Note 12',
    appVersion: '1.0.0',
    pairedAt: ago(20 * DAY),
    lastSeenAt: ago(4 * MINUTE),
    online: true,
    status: 'active',
    revokedAt: null,
    revokeReason: null,
    flags: 0,
    uploadsToday: 12,
    ...given,
  };
}

export const RUMANA = phone({ id: 'phone-1' });
export const SHOP_PHONE = phone({
  id: 'phone-2',
  name: 'Shop phone',
  model: 'Samsung Galaxy A14',
  lastSeenAt: ago(2 * HOUR),
  online: false,
  uploadsToday: 0,
});
export const OLD_PHONE = phone({
  id: 'phone-3',
  name: 'Old phone',
  status: 'revoked',
  online: false,
  revokedAt: ago(30 * DAY),
  revokeReason: 'owner',
  uploadsToday: 0,
});

export interface ShopPaymentsFixture {
  payments: ShopPaymentRow[];
  receipts: PhoneReceiptRow[];
  phones: ListenerPhoneRow[];
  limit: number | null;
  /** What GET /payments may hold as due: verifying more is refused, as the server does. */
  dueAtMost: number;
  /** How long a pairing code lives. */
  codeLifeMs: number;
  /** The phone that pairs when the page next looks, once a code has been made. */
  arrives: ListenerPhoneRow | null;
  codes: number;
  /** Refuses the next pairing code. */
  pairingRefused: { status: number; code: string; message: string } | null;
}

/** `pay35`, `pay35-receipts`, `lp35`: four waiting, each settled status, three receipts, two phones and one cancelled. */
export function drawnShopPayments(): ShopPaymentsFixture {
  return {
    payments: [
      waiting({
        id: 's-amount',
        reviewReason: 'amount',
        receipt: { amount: '450.00', senderNumber: '+8801712000111', receivedAt: ago(HOUR) },
      }),
      waiting({
        id: 's-sender',
        order: { id: 'order-38', orderNumber: '261105-0038' },
        amount: '300.00',
        transactionId: '5TK9WQ2B',
        senderNumber: '+8801819000222',
        source: 'staff_link',
        reviewReason: 'sender',
        receipt: { amount: '300.00', senderNumber: '+8801555123456', receivedAt: ago(HOUR) },
      }),
      waiting({
        id: 's-plain',
        order: { id: 'order-37', orderNumber: '261105-0037' },
        amount: '800.00',
        transactionId: '2LM7VN6C',
        senderNumber: '+8801611000333',
      }),
      waiting({
        id: 's-nagad',
        order: { id: 'order-36', orderNumber: '261104-0036' },
        method: 'nagad',
        amount: '1200.00',
        transactionId: 'N7Q2ZX41',
        senderNumber: '+8801555000444',
      }),
      settled({
        id: 'p-listener',
        order: { id: 'order-39', orderNumber: '261105-0039' },
        transactionId: '9F2KQ7M1',
        senderNumber: '+8801819876543',
        at: ago(2 * HOUR),
      }),
      settled({
        id: 'p-test',
        order: { id: 'order-34', orderNumber: '261105-0034' },
        amount: '200.00',
        transactionId: 'TEST0042',
        verificationLevel: 'gateway',
        test: true,
        at: ago(3 * HOUR),
      }),
      settled({
        id: 'p-hand',
        order: { id: 'order-31', orderNumber: '261104-0031' },
        method: 'nagad',
        amount: '990.00',
        transactionId: '3M8KLP21',
        verificationLevel: 'manual',
        decidedBy: { id: 'u-1', name: 'Rumana' },
        at: ago(DAY + HOUR),
      }),
      waiting({
        id: 's-rejected',
        status: 'rejected',
        order: { id: 'order-28', orderNumber: '261104-0028' },
        amount: '400.00',
        transactionId: '6HN2CC80',
        source: 'staff_link',
        rejectReason: 'no_payment_found',
        decidedBy: { id: 'u-1', name: 'Rumana' },
        decidedAt: ago(DAY + HOUR),
        at: ago(DAY + HOUR),
      }),
      settled({
        id: 'p-refunded',
        status: 'refunded',
        order: { id: 'order-26', orderNumber: '261104-0026' },
        method: 'rocket',
        amount: '650.00',
        transactionId: 'R5Y8BB13',
        at: ago(DAY + 2 * HOUR),
      }),
      settled({
        id: 'p-voided',
        status: 'voided',
        order: { id: 'order-25', orderNumber: '261104-0025' },
        method: 'bank',
        amount: '2000.00',
        transactionId: 'REF-77120',
        at: ago(DAY + 3 * HOUR),
      }),
    ],
    receipts: [
      {
        id: 'r-review',
        sender: 'bKash',
        method: 'bkash',
        amount: '450.00',
        transactionId: '8HC3P2M1',
        status: 'needs_review',
        reviewReason: 'amount',
        ignoredReason: null,
        orderNumber: '261105-0040',
        receivedAt: ago(HOUR),
        senderNumber: '+8801712000111',
        deviceId: 'phone-1',
        text: 'You have received Tk 450.00 from 01712000111. TrxID 8HC3P2M1',
      },
      {
        id: 'r-none',
        sender: 'bKash',
        method: 'bkash',
        amount: '1500.00',
        transactionId: '4XW8JD3K',
        status: 'unmatched',
        reviewReason: null,
        ignoredReason: null,
        orderNumber: null,
        receivedAt: ago(2 * HOUR),
        senderNumber: '+8801911555666',
        deviceId: 'phone-1',
        text: null,
      },
      {
        id: 'r-matched',
        sender: 'bKash',
        method: 'bkash',
        amount: '500.00',
        transactionId: '9F2KQ7M1',
        status: 'matched',
        reviewReason: null,
        ignoredReason: null,
        orderNumber: '261105-0039',
        receivedAt: ago(3 * HOUR),
        senderNumber: '+8801819876543',
        deviceId: 'phone-1',
        text: null,
      },
    ],
    // Taken now, not when this file loaded: a worker runs for minutes, and the page says how long ago.
    phones: [{ ...RUMANA, lastSeenAt: ago(4 * MINUTE) }, SHOP_PHONE, OLD_PHONE],
    limit: 5,
    dueAtMost: 1000,
    codeLifeMs: 10 * MINUTE,
    arrives: null,
    codes: 0,
    pairingRefused: null,
  };
}

/** What a call to these routes answers with, or undefined for a route of something else. */
export function shopPaymentsAnswer(
  method: string,
  path: string,
  url: URL,
  body: Record<string, unknown> | null,
  fixture: ShopPaymentsFixture,
):
  | { data: unknown }
  | { csv: string }
  | {
      refused: { status: number; code: string; message: string; details?: Record<string, unknown> };
    }
  | undefined {
  if (method === 'GET' && path === '/payments/export') {
    return { csv: 'at,orderNumber,status\n' };
  }
  if (method === 'GET' && path === '/payments') {
    const status = url.searchParams.get('status');
    const how = url.searchParams.get('method');
    const q = url.searchParams.get('q');
    const rows = fixture.payments.filter(
      (row) =>
        (!status || row.status === status) &&
        (!how || row.method === how) &&
        (!q || (row.transactionId ?? '').startsWith(q.toUpperCase())),
    );
    const limit = Number(url.searchParams.get('limit') ?? 25);
    const page = Number(url.searchParams.get('page') ?? 1);
    return {
      data: {
        payments: rows.slice((page - 1) * limit, page * limit),
        page,
        limit,
        total: rows.length,
        pages: Math.max(1, Math.ceil(rows.length / limit)),
        amount: rows
          .filter((row) => !row.test)
          .reduce((sum, row) => sum + Number(row.amount), 0)
          .toFixed(2),
      },
    };
  }
  const deciding = /^\/payments\/([^/]+)\/(verify|reject)$/.exec(path);
  if (method === 'POST' && deciding) {
    const row = fixture.payments.find((each) => each.id === deciding[1]);
    if (!row) return { refused: { status: 404, code: 'not_found', message: 'Not found' } };
    if (deciding[2] === 'verify') {
      if (Number(body?.amount) > fixture.dueAtMost) {
        return {
          refused: {
            status: 400,
            code: 'validation_failed',
            message: 'Check the amount.',
            details: {
              fields: [{ field: 'amount', problem: 'out_of_range', message: 'Too much.' }],
            },
          },
        };
      }
      row.status = 'verified';
      row.kind = 'payment';
      row.amount = Number(body?.amount).toFixed(2);
      row.verificationLevel = 'manual';
    } else {
      row.status = 'rejected';
      row.rejectReason = String(body?.reason);
      row.note = (body?.note as string | undefined) ?? null;
    }
    return { data: { id: row.order.id } };
  }
  if (method === 'GET' && path === '/listener/receipts') {
    const q = url.searchParams.get('q');
    const rows = fixture.receipts.filter(
      (row) => !q || (row.transactionId ?? '').startsWith(q.toUpperCase()),
    );
    return {
      data: { receipts: rows, page: 1, limit: 25, total: rows.length, pages: 1 },
    };
  }
  if (method === 'GET' && path === '/listener/devices') {
    if (fixture.codes > 0 && fixture.arrives) {
      fixture.phones = [...fixture.phones, fixture.arrives];
      fixture.arrives = null;
    }
    return {
      data: {
        devices: fixture.phones,
        active: fixture.phones.filter((each) => each.status === 'active').length,
        limit: fixture.limit,
      },
    };
  }
  if (method === 'POST' && path === '/listener/pairing-codes') {
    if (fixture.pairingRefused) return { refused: fixture.pairingRefused };
    fixture.codes += 1;
    return {
      data: {
        code: fixture.codes === 1 ? 'K7MP4X2H' : 'N3WC0D2E',
        expiresAt: new Date(Date.now() + fixture.codeLifeMs).toISOString(),
      },
    };
  }
  const device = /^\/listener\/devices\/([^/]+)(\/revoke)?$/.exec(path);
  if (device && (method === 'PATCH' || method === 'POST')) {
    const row = fixture.phones.find((each) => each.id === device[1]);
    if (!row) return { refused: { status: 404, code: 'not_found', message: 'Not found' } };
    // A new row, not a change to this one: the phones above are shared by every test in a worker.
    const changed: ListenerPhoneRow = device[2]
      ? {
          ...row,
          status: 'revoked',
          online: false,
          revokedAt: new Date().toISOString(),
          revokeReason: 'owner',
        }
      : { ...row, name: String(body?.name) };
    fixture.phones = fixture.phones.map((each) => (each.id === row.id ? changed : each));
    return { data: changed };
  }
  return undefined;
}
