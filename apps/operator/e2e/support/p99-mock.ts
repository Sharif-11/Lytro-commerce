// Slice 9.9: limited mode (degraded mode, DAT-38) and the daily money check's differences (DAT-52), as the server answers
// them -- drawn from the sketch's own rows (docs/brand/lytro-operator.html, "Phase 9 · Slice 9.9").

export interface DifferenceFixture {
  id: string;
  day: string;
  kind: string;
  subject: string;
  tenantId: string | null;
  shopName: string | null;
  shopSlug: string | null;
  expected: string | null;
  found: string | null;
  details: Record<string, string | number | null>;
  state: 'open' | 'resolved';
  note: string | null;
  resolvedBy: string | null;
  resolvedByEmail: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface P99MockState {
  degraded: { on: boolean; noticeId: string | null; factor: number };
  differences: DifferenceFixture[];
  lastRun: { day: string; ranAt: string } | null;
}

const RAN_AT = '2026-10-21T00:00:04.000Z';

export function drawnDifferences(): DifferenceFixture[] {
  const base = {
    day: '2026-10-20',
    details: {},
    state: 'open' as const,
    note: null,
    resolvedBy: null,
    resolvedByEmail: null,
    resolvedAt: null,
    createdAt: RAN_AT,
  };
  return [
    {
      ...base,
      id: 'diff-invoice',
      kind: 'invoice_mismatch',
      subject: 'pay-mehedi-1',
      tenantId: 'shop-mehedi',
      shopName: 'Mehedi Books',
      shopSlug: 'mehedi-books',
      expected: null,
      found: null,
      details: { invoices: 0 },
    },
    {
      ...base,
      id: 'diff-topup',
      kind: 'top_up_credit_mismatch',
      subject: 'pay-arif-1',
      tenantId: 'shop-arif',
      shopName: 'Arif Electronics',
      shopSlug: 'arif-electronics',
      expected: '500.00',
      found: '0.00',
    },
    {
      ...base,
      id: 'diff-unclaimed',
      kind: 'wallet_money_unclaimed',
      subject: 'msg-1',
      tenantId: null,
      shopName: null,
      shopSlug: null,
      expected: null,
      found: '1280.00',
    },
    {
      ...base,
      id: 'diff-resolved-1',
      kind: 'proof_without_payment',
      subject: 'pay-sadia-1',
      tenantId: 'shop-sadia',
      shopName: 'Sadia Collection',
      shopSlug: 'sadia-collection',
      expected: '449.00',
      found: '449.00',
      state: 'resolved',
      note: 'The SMS came late; matched by hand to the payment.',
      resolvedBy: 'op-1',
      resolvedByEmail: 'ops@lytro.app',
      resolvedAt: '2026-10-21T04:12:00.000Z',
    },
    {
      ...base,
      id: 'diff-resolved-2',
      kind: 'balance_drift',
      subject: 'shop-keya',
      tenantId: 'shop-keya',
      shopName: 'Keya Boutique',
      shopSlug: 'keya-boutique',
      expected: '1200.00',
      found: '1150.00',
      state: 'resolved',
      note: 'A refund was entered twice; reversed one.',
      resolvedBy: 'op-1',
      resolvedByEmail: 'ops@lytro.app',
      resolvedAt: '2026-10-21T05:00:00.000Z',
    },
  ];
}

export function p99Defaults(): P99MockState {
  return {
    degraded: { on: false, noticeId: null, factor: 2 },
    differences: drawnDifferences(),
    lastRun: { day: '2026-10-20', ranAt: RAN_AT },
  };
}

type Answer = { data: unknown } | { refused: [number, string, string, Record<string, unknown>?] };

/** Limited mode's switch and the money check's list and resolve, as the server answers them. */
export function p99Answer(
  method: string,
  path: string,
  url: URL,
  body: Record<string, unknown> | null,
  state: P99MockState & { settings: Record<string, unknown>[]; now: string },
): Answer | undefined {
  if (path === '/operator/degraded-mode') {
    if (method === 'PUT') {
      const on = body?.['on'] === true;
      state.degraded = { ...state.degraded, on, noticeId: on ? 'notice-limited' : null };
      const record = state.settings.find((setting) => setting['key'] === 'degraded_mode');
      if (record) {
        record['value'] = { on, noticeId: state.degraded.noticeId };
        record['updatedAt'] = new Date(state.now).toISOString();
        record['updatedBy'] = 'op-1';
        record['updatedByEmail'] = 'ops@lytro.app';
      }
    }
    return { data: state.degraded };
  }
  if (path === '/operator/reconciliation/differences' && method === 'GET') {
    const wanted = (key: string) => url.searchParams.get(key);
    const page = Number(wanted('page') ?? 1);
    const limit = Number(wanted('limit') ?? 50);
    const rows = state.differences.filter(
      (row) =>
        row.state === (wanted('state') ?? 'open') &&
        (!wanted('day') || row.day === wanted('day')) &&
        (!wanted('kind') || row.kind === wanted('kind')),
    );
    return {
      data: {
        differences: rows.slice((page - 1) * limit, page * limit),
        page,
        limit,
        total: rows.length,
        pages: Math.ceil(rows.length / limit),
        lastRun: state.lastRun,
      },
    };
  }
  const resolving = /^\/operator\/reconciliation\/differences\/([^/]+)\/resolve$/.exec(path);
  if (resolving && method === 'POST') {
    const row = state.differences.find((each) => each.id === resolving[1]);
    if (!row) return { refused: [404, 'not_found', 'This difference was not found.'] };
    if (row.state === 'resolved') {
      return { refused: [409, 'conflict', 'This difference is resolved already.'] };
    }
    const note = typeof body?.['note'] === 'string' ? body['note'].trim() : '';
    if (note === '') return { refused: [400, 'validation_error', 'Write what you found.'] };
    Object.assign(row, {
      state: 'resolved',
      note,
      resolvedBy: 'op-1',
      resolvedByEmail: 'ops@lytro.app',
      resolvedAt: new Date(state.now).toISOString(),
    });
    return { data: row };
  }
  return undefined;
}
