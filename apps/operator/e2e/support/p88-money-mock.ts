import type { Page } from '@playwright/test';
import {
  drawnPaymentMethods,
  drawnPrices,
  drawnShops,
  NOW,
  REVIEW_RENEWAL,
  type PaymentFixture,
} from './console-data';

// OPERATOR-CONSOLE-DESIGN v7 §4b and §10d's sample data (the sketch's P88_ENTRIES and P88_TYPES), and the operator's manual
// entry, payment screenshot and payment method type routes answered over it the way the server answers them (Phase 8 Slices
// 8.5, 8.7 and 8.8).

// The signed-in operator, one id for every mock (console-data.ts).
import { OPERATOR_ID } from './console-data';

export { OPERATOR_ID };
const NADIA = 'op-2';
const DAY_MS = 24 * 60 * 60 * 1000;
// D8-51, ADM-15: the second confirmation, over this many taka.
const CONFIRM_ABOVE = 10_000;

export interface ManualEntryFixture {
  id: string;
  tenantId: string;
  shopName: string;
  shopSlug: string;
  planPaymentId: string;
  kind: string;
  planName: string | null;
  amount: string;
  walletId: string | null;
  bankAccountId: string | null;
  transactionId: string | null;
  senderNumber: string | null;
  paidAt: string | null;
  evidenceId: string | null;
  evidenceLine: string | null;
  reason: string;
  enteredBy: string;
  enteredByEmail: string | null;
  reversesEntryId: string | null;
  reversedBy: { id: string; reason: string; at: string } | null;
  createdAt: string;
}

export interface WalletTypeFixture {
  method: string;
  kind: 'wallet' | 'bank';
  state: 'active' | 'retiring' | 'removed';
  retiringSince: string | null;
  removedAt: string | null;
  shopsOn: number;
  shopsWithAccounts: number;
  openPayments: number;
  shopsSetUp: number;
  lytroTakes: boolean;
}

export interface MoneyMockState {
  manualEntries: ManualEntryFixture[];
  walletTypes: WalletTypeFixture[];
  /** The price the server now asks, when it differs from the preview's (D8-51). */
  priceNow: string | null;
  /** A reversal is refused: the shop's plan has moved on since the entry (D8-48). */
  planMovedOn: boolean;
  /** The screenshots the server no longer holds. */
  shotsGone: string[];
}

const SHOPS = new Map(drawnShops().map((shop) => [shop.id, shop]));

function shop(id: string): { shopName: string; shopSlug: string } {
  const found = SHOPS.get(id);
  return { shopName: found?.shopName ?? id, shopSlug: found?.slug ?? id };
}

function entry(
  id: string,
  tenantId: string,
  kind: string,
  planName: string | null,
  amount: number,
  paid: {
    walletId?: string;
    bankAccountId?: string;
    transactionId: string;
    senderNumber: string | null;
    paidAt: string;
  },
  evidence: { evidenceId?: string; evidenceLine?: string },
  createdAt: string,
  by: 'ops' | 'nadia' = 'ops',
): ManualEntryFixture {
  return {
    id,
    tenantId,
    ...shop(tenantId),
    planPaymentId: `pp-${id}`,
    kind,
    planName,
    amount: amount.toFixed(2),
    walletId: paid.walletId ?? null,
    bankAccountId: paid.bankAccountId ?? null,
    transactionId: paid.transactionId,
    senderNumber: paid.senderNumber,
    paidAt: paid.paidAt,
    evidenceId: evidence.evidenceId ?? null,
    evidenceLine: evidence.evidenceLine ?? null,
    reason: 'Sent at 9 pm with no phone online; checked against the statement',
    enteredBy: by === 'ops' ? OPERATOR_ID : NADIA,
    enteredByEmail: by === 'ops' ? 'ops@lytro.app' : 'nadia@lytro.app',
    reversesEntryId: null,
    reversedBy: null,
    createdAt,
  };
}

const WRONG_SHOP = 'Recorded against the wrong shop; it was Arif Mobiles';

/** The sketch's six: a bank renewal, a Nagad renewal, a top-up with a statement line, a reversal and what it reversed. */
export function drawnManualEntries(): ManualEntryFixture[] {
  const reversal: ManualEntryFixture = {
    ...entry(
      'me-29',
      'ten-0040',
      'top_up',
      null,
      500,
      { transactionId: '', senderNumber: null, paidAt: '' },
      {},
      '2026-10-20T16:30:00+06:00',
      'nadia',
    ),
    transactionId: null,
    paidAt: null,
    reason: WRONG_SHOP,
    reversesEntryId: 'me-27',
    planPaymentId: 'pp-me-27',
  };
  return [
    entry(
      'me-32',
      'ten-0023',
      'renewal',
      'Growth',
      3984,
      {
        bankAccountId: 'b1',
        transactionId: 'BRAC-FT-55190327',
        senderNumber: null,
        paidAt: '2026-10-21T11:30:00+06:00',
      },
      { evidenceLine: '21-10-2026 BEFTN CR 3,984.00 TANVIR MOBILES REF BRAC-FT-55190327' },
      '2026-10-21T14:20:00+06:00',
    ),
    entry(
      'me-31',
      'ten-0028',
      'renewal',
      'Starter',
      4741,
      {
        walletId: 'w2',
        transactionId: 'NGD8K2P0XQ',
        senderNumber: '01911 223344',
        paidAt: '2026-10-20T21:15:00+06:00',
      },
      { evidenceId: 'ev-31' },
      '2026-10-21T13:40:00+06:00',
    ),
    entry(
      'me-30',
      'ten-0015',
      'top_up',
      null,
      2000,
      {
        walletId: 'w1',
        transactionId: 'BKH9Q4L7M2',
        senderNumber: '01911 445566',
        paidAt: '2026-10-20T18:42:00+06:00',
      },
      { evidenceLine: '20/10/2026 18:42 Cash In 2,000.00 01911445566 BKH9Q4L7M2' },
      '2026-10-21T10:05:00+06:00',
    ),
    reversal,
    entry(
      'me-28',
      'ten-0019',
      'purchase',
      'Starter',
      449,
      {
        walletId: 'w1',
        transactionId: 'BKH4P2L9K7',
        senderNumber: '01815 345678',
        paidAt: '2026-10-19T10:01:00+06:00',
      },
      { evidenceId: 'ev-28' },
      '2026-10-19T12:12:00+06:00',
    ),
    {
      ...entry(
        'me-27',
        'ten-0040',
        'top_up',
        null,
        500,
        {
          walletId: 'w1',
          transactionId: 'BKH3Z6X8C1',
          senderNumber: '01716 880011',
          paidAt: '2026-10-17T20:30:00+06:00',
        },
        { evidenceId: 'ev-27' },
        '2026-10-18T09:40:00+06:00',
      ),
      reversedBy: { id: 'me-29', reason: WRONG_SHOP, at: '2026-10-20T16:30:00+06:00' },
    },
  ];
}

/**
 * The sketch's five types, all active. The shops that set one up are those with an account and those with it on and
 * none (WAL-05), so more than either count alone: Upay's 7 are its 5 with an account and 2 on with none.
 */
export function drawnWalletTypes(): WalletTypeFixture[] {
  const type = (
    method: string,
    shopsOn: number,
    shopsWithAccounts: number,
    openPayments: number,
    lytroTakes: boolean,
    shopsSetUp: number,
  ): WalletTypeFixture => ({
    method,
    kind: method === 'bank' ? 'bank' : 'wallet',
    state: 'active',
    retiringSince: null,
    removedAt: null,
    shopsOn,
    shopsWithAccounts,
    openPayments,
    shopsSetUp,
    lytroTakes,
  });
  return [
    type('bkash', 284, 301, 37, true, 305),
    type('nagad', 156, 170, 12, true, 172),
    type('rocket', 9, 14, 0, false, 14),
    type('upay', 3, 5, 1, false, 7),
    type('bank', 22, 25, 2, true, 25),
  ];
}

/** Upay retiring since 19 Oct; with `clear`, nothing holds it any more. */
export function upayRetiring(clear = false): WalletTypeFixture[] {
  return drawnWalletTypes().map((each) =>
    each.method === 'upay'
      ? {
          ...each,
          state: 'retiring',
          retiringSince: '2026-10-19T10:00:00+06:00',
          ...(clear ? { shopsOn: 0, openPayments: 0, shopsSetUp: each.shopsWithAccounts } : {}),
        }
      : each,
  );
}

/** Upay removed on 18 Nov. */
export function upayRemoved(): WalletTypeFixture[] {
  return drawnWalletTypes().map((each) =>
    each.method === 'upay'
      ? {
          ...each,
          state: 'removed',
          retiringSince: '2026-10-19T10:00:00+06:00',
          removedAt: '2026-11-18T10:00:00+06:00',
          shopsOn: 0,
          shopsSetUp: each.shopsWithAccounts,
          openPayments: 0,
        }
      : each,
  );
}

/** Lytro's bank account the sketch draws (v6's §10). */
export function withBankAccount(): Record<string, unknown> {
  return {
    ...drawnPaymentMethods(),
    bankAccounts: [
      {
        id: 'b1',
        bankName: 'BRAC Bank',
        accountName: 'Lytronix Ltd',
        accountNumber: '1501 2045 6789 001',
        branch: 'Gulshan',
        routingNumber: null,
        swiftCode: null,
        instructions: null,
        enabled: true,
        displayOrder: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  };
}

export function moneyDefaults(): MoneyMockState {
  return {
    manualEntries: drawnManualEntries(),
    walletTypes: drawnWalletTypes(),
    priceNow: null,
    planMovedOn: false,
    shotsGone: [],
  };
}

/** The seller's screenshot on the sketch's first queued payment (ADM-17). */
export function withShots(payments: PaymentFixture[]): PaymentFixture[] {
  return payments.map((each) =>
    Object.assign({ evidenceId: each.id === REVIEW_RENEWAL ? 'ev-9101' : null }, each),
  );
}

// A picture the console's policy lets an <img> show, standing in for the five-minute link to the private bucket.
export const SHOT_URL = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="250"><rect width="220" height="250" fill="#fff"/><rect width="220" height="40" fill="#CF2772"/><text x="12" y="26" fill="#fff" font-family="sans-serif" font-weight="700" font-size="14">bKash</text><circle cx="110" cy="76" r="20" fill="#e3f3e9"/><text x="110" y="122" text-anchor="middle" font-family="sans-serif" font-weight="600" font-size="13">Send Money successful</text><text x="110" y="152" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="22">৳449</text><text x="12" y="190" font-family="monospace" font-size="12">To 01711000001</text><text x="12" y="210" font-family="monospace" font-size="12">TrxID BKH7A2M9Q1</text></svg>',
)}`;
export const UPLOAD_ORIGIN = 'https://evidence.test';

/** The signed links a screenshot is sent to, answered as R2 would. */
export async function answerUploads(page: Page): Promise<void> {
  await page.route(`${UPLOAD_ORIGIN}/**`, (route) => route.fulfill({ status: 200, body: '' }));
}

type MoneyAnswer =
  { data: unknown } | { refused: [number, string, string, Record<string, unknown>?] };

interface MoneyContext {
  manualEntries: ManualEntryFixture[];
  walletTypes: WalletTypeFixture[];
  priceNow: string | null;
  planMovedOn: boolean;
  shotsGone: string[];
  shops: { id: string; planId: string | null }[];
  prices: { planId: string; billingTermId: string; price: string }[];
  terms: Record<string, unknown>[];
}

function previewOf(
  body: Record<string, unknown>,
  state: MoneyContext,
): { kind: string; amount: string; periodEnd: string | null; needsConfirmation: boolean } {
  if (body.kind === 'top_up') {
    const amount = Number(body.amount ?? 0);
    return {
      kind: 'top_up',
      amount: amount.toFixed(2),
      periodEnd: null,
      needsConfirmation: amount > CONFIRM_ABOVE,
    };
  }
  const price =
    (state.prices.length > 0 ? state.prices : drawnPrices()).find(
      (each) => each.planId === body.planId && each.billingTermId === body.billingTermId,
    )?.price ?? '0.00';
  const months = Number(state.terms.find((each) => each.id === body.billingTermId)?.months ?? 1);
  const shopNow = state.shops.find((each) => each.id === body.tenantId);
  const kind =
    body.kind === 'upgrade' ? 'upgrade' : shopNow?.planId === body.planId ? 'renewal' : 'purchase';
  return {
    kind,
    amount: price,
    periodEnd: new Date(new Date(NOW).getTime() + months * 29 * DAY_MS).toISOString(),
    needsConfirmation: Number(price) > CONFIRM_ABOVE,
  };
}

/** The manual entry, screenshot and payment method type routes. */
export function moneyAnswer(
  method: string,
  path: string,
  url: URL,
  body: Record<string, unknown> | null,
  state: MoneyContext,
): MoneyAnswer | undefined {
  if (path === '/operator/manual-entries' && method === 'GET') {
    const by = url.searchParams;
    const from = by.get('dateFrom');
    const to = by.get('dateTo');
    const dayOf = (iso: string) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date(iso));
    const matching = state.manualEntries.filter(
      (each) =>
        (!by.get('tenantId') || each.tenantId === by.get('tenantId')) &&
        (!by.get('operatorId') || each.enteredBy === by.get('operatorId')) &&
        (!from || dayOf(each.createdAt) >= from) &&
        (!to || dayOf(each.createdAt) <= to),
    );
    const page = Number(by.get('page') ?? 1);
    const limit = Number(by.get('limit') ?? 50);
    return {
      data: {
        entries: matching.slice((page - 1) * limit, page * limit),
        total: matching.length,
        page,
        limit,
      },
    };
  }
  if (path === '/operator/manual-entries/preview') {
    const preview = previewOf(body ?? {}, state);
    return { data: { ...preview, creditAmount: '0.00', addons: [] } };
  }
  if (path === '/operator/manual-entries/evidence') {
    return {
      data: {
        key: 'evidence/operator/e2e-shot',
        upload: {
          url: `${UPLOAD_ORIGIN}/evidence/operator/e2e-shot?signed=1`,
          method: 'PUT',
          headers: { 'content-type': String(body?.contentType) },
          expiresAt: NOW,
        },
      },
    };
  }
  if (path === '/operator/manual-entries' && method === 'POST' && body) {
    const reference = String(body.transactionId).toUpperCase();
    const used = state.manualEntries.some(
      (each) => each.transactionId === reference && each.reversedBy === null,
    );
    if (used) {
      return {
        refused: [
          409,
          'conflict',
          'Check the highlighted fields.',
          {
            fields: [
              {
                field: 'transactionId',
                problem: 'already_used',
                message: 'This transaction ID has already been used.',
              },
            ],
          },
        ],
      };
    }
    const preview = previewOf(body, state);
    const asked = state.priceNow ?? preview.amount;
    if (body.kind !== 'top_up' && Number(body.amount) !== Number(asked)) {
      return {
        refused: [409, 'conflict', `The amount is now ৳${asked}.`, { amount: asked }],
      };
    }
    const tenantId = String(body.tenantId);
    const made: ManualEntryFixture = {
      ...entry(
        `me-${String(40 + state.manualEntries.length)}`,
        tenantId,
        preview.kind,
        body.kind === 'top_up' ? null : 'Starter',
        Number(body.amount),
        {
          ...(typeof body.walletId === 'string' ? { walletId: body.walletId } : {}),
          ...(typeof body.bankAccountId === 'string' ? { bankAccountId: body.bankAccountId } : {}),
          transactionId: reference,
          senderNumber: typeof body.senderNumber === 'string' ? body.senderNumber : null,
          paidAt: String(body.paidAt),
        },
        {
          ...(typeof body.evidenceKey === 'string' ? { evidenceId: 'ev-new' } : {}),
          ...(typeof body.evidenceLine === 'string' ? { evidenceLine: body.evidenceLine } : {}),
        },
        NOW,
      ),
      reason: String(body.reason),
    };
    state.manualEntries = [made, ...state.manualEntries];
    return { data: made };
  }
  const reversing = /^\/operator\/manual-entries\/([^/]+)\/reverse$/.exec(path);
  if (reversing) {
    if (state.planMovedOn) {
      return {
        refused: [
          409,
          'conflict',
          "The shop's plan has changed since this entry, so it can't be put back. Reverse the later payment first.",
        ],
      };
    }
    const original = state.manualEntries.find((each) => each.id === reversing[1]);
    if (!original) return { refused: [404, 'not_found', 'Manual entry not found.'] };
    const reversal: ManualEntryFixture = {
      ...original,
      id: `${original.id}-r`,
      walletId: null,
      bankAccountId: null,
      transactionId: null,
      senderNumber: null,
      paidAt: null,
      evidenceId: null,
      evidenceLine: null,
      reason: String(body?.reason),
      reversesEntryId: original.id,
      reversedBy: null,
      createdAt: NOW,
    };
    original.reversedBy = { id: reversal.id, reason: reversal.reason, at: NOW };
    state.manualEntries = [reversal, ...state.manualEntries];
    return { data: reversal };
  }
  const shot = /^\/operator\/(?:manual-entries|payment-queue)\/([^/]+)\/evidence$/.exec(path);
  if (shot) {
    if (state.shotsGone.includes(shot[1] ?? '')) {
      return { refused: [404, 'not_found', 'Evidence not found.'] };
    }
    return { data: { url: SHOT_URL, expiresAt: NOW } };
  }
  if (path === '/operator/payment-method-types') return { data: { types: state.walletTypes } };
  const changed = /^\/operator\/payment-method-types\/([^/]+)\/(retire|undo-retire|remove)$/.exec(
    path,
  );
  if (changed) {
    const type = state.walletTypes.find((each) => each.method === changed[1]);
    if (!type) return { refused: [404, 'not_found', 'There is no such payment method.'] };
    // D8-66: every shop that set it up is told, as the server counts them.
    const told = type.shopsSetUp;
    if (changed[2] === 'retire') {
      type.state = 'retiring';
      type.retiringSince = NOW;
      return { data: { type, told } };
    }
    if (changed[2] === 'undo-retire') {
      type.state = 'active';
      type.retiringSince = null;
      return { data: { type, told } };
    }
    if (type.shopsOn > 0 || type.openPayments > 0 || type.lytroTakes) {
      return {
        refused: [
          409,
          'conflict',
          "It can't be removed while it is in use.",
          { shopsOn: type.shopsOn, openPayments: type.openPayments, lytroTakes: type.lytroTakes },
        ],
      };
    }
    type.state = 'removed';
    type.removedAt = NOW;
    return { data: { type, cleared: type.shopsWithAccounts } };
  }
  return undefined;
}
