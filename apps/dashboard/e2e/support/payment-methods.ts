import type { Language } from './mock-api';

// Payment methods against a mocked API (Slice 5.8's part 1, the prototype's Part 33): the shop the page is drawn with, and
// the writes, each answering as the server does.

export interface AccountFixture {
  id: string;
  accountName: string;
  number: string | null;
  accountType: 'personal' | 'agent' | 'merchant' | null;
  note: string | null;
  bankName: string | null;
  accountNumber: string | null;
  branch: string | null;
  routingNumber: string | null;
  swiftCode: string | null;
  instructions: string | null;
  active: boolean;
  hasCredentials: boolean;
  credentialsUnreadable: boolean;
  sandbox: boolean;
  automated: boolean;
}

export interface MethodFixture {
  method: 'bkash' | 'nagad' | 'rocket' | 'upay' | 'bank';
  kind: 'wallet' | 'bank';
  enabled: boolean;
  levels: string[];
  way: 'automated' | 'listener' | 'manual';
  ways: string[];
  accounts: AccountFixture[];
}

export interface PaymentMethodsFixture {
  methods: MethodFixture[];
  ownerPhoneVerified: boolean;
  /** How many listener phones work now. */
  phones?: number;
  /** What a test of the connection finds; connected unless a test says otherwise. */
  test?: { ok: boolean; code: string | null };
}

function account(id: string, values: Partial<AccountFixture>): AccountFixture {
  return {
    id,
    accountName: '',
    number: null,
    accountType: null,
    note: null,
    bankName: null,
    accountNumber: null,
    branch: null,
    routingNumber: null,
    swiftCode: null,
    instructions: null,
    active: false,
    hasCredentials: false,
    credentialsUnreadable: false,
    sandbox: false,
    automated: false,
    ...values,
  };
}

const MANUAL_ONLY = { levels: ['manual'], way: 'manual', ways: ['manual'] } as const;

function method(
  name: MethodFixture['method'],
  enabled: boolean,
  accounts: AccountFixture[] = [],
): MethodFixture {
  if (name === 'bkash') {
    return {
      method: name,
      kind: 'wallet',
      enabled,
      levels: ['manual', 'listener', 'gateway'],
      way: 'listener',
      ways: ['automated', 'listener', 'manual'],
      accounts,
    };
  }
  return {
    method: name,
    kind: name === 'bank' ? 'bank' : 'wallet',
    enabled,
    ...MANUAL_ONLY,
    ways: ['manual'],
    levels: ['manual'],
    accounts,
  };
}

/** `pm33-first`: a new shop, every method off and nothing saved. */
export function nothingSetUp(ownerPhoneVerified = true): PaymentMethodsFixture {
  return {
    methods: (['bkash', 'nagad', 'rocket', 'upay', 'bank'] as const).map((name) =>
      method(name, false),
    ),
    ownerPhoneVerified,
  };
}

/** `pm33`: bKash on the listener with two accounts, Nagad on, Rocket off with one saved, Upay off, a bank on with none. */
export function drawnMethods(language: Language = 'bn'): PaymentMethodsFixture {
  const megh = language === 'bn' ? 'মেঘ ফ্যাশন' : 'Megh Fashion';
  const rumana = language === 'bn' ? 'রুমানা আক্তার' : 'Rumana Akter';
  return {
    methods: [
      method('bkash', true, [
        account('bk-main', {
          accountName: megh,
          number: '01711234567',
          accountType: 'merchant',
          active: true,
        }),
        account('bk-spare', {
          accountName: rumana,
          number: '01911222333',
          accountType: 'personal',
        }),
      ]),
      method('nagad', true, [
        account('ng-1', {
          accountName: rumana,
          number: '01711234567',
          accountType: 'personal',
          active: true,
        }),
      ]),
      method('rocket', false, [
        account('rk-1', {
          accountName: rumana,
          number: '017112345678',
          accountType: 'personal',
        }),
      ]),
      method('upay', false),
      method('bank', true),
    ],
    ownerPhoneVerified: true,
  };
}

/** The drawn shop with bKash's main account changed, and bKash's way where a state moves it. */
function withMain(
  language: Language,
  values: Partial<AccountFixture>,
  way: MethodFixture['way'] = 'automated',
): PaymentMethodsFixture {
  const drawn = drawnMethods(language);
  const bkash = drawn.methods[0];
  const main = bkash?.accounts[0];
  if (bkash && main) {
    Object.assign(main, values);
    bkash.way = way;
  }
  return drawn;
}

/** `pm33-auto`: keys saved on the main account, which takes bKash's automated payments. */
export const automatedMethods = (language: Language = 'bn'): PaymentMethodsFixture =>
  withMain(language, { hasCredentials: true, automated: true });

/** `pm33-auto-test`: the same, on bKash's sandbox. */
export const testAccountMethods = (language: Language = 'bn'): PaymentMethodsFixture =>
  withMain(language, { hasCredentials: true, automated: true, sandbox: true });

/** `pm33-unreadable`: keys that no longer open. */
export const unreadableMethods = (language: Language = 'bn'): PaymentMethodsFixture =>
  withMain(language, { credentialsUnreadable: true, automated: true });

/** Keys saved, while the wallet stays on the listener: connected, not turned on. */
export const keysSavedMethods = (language: Language = 'bn'): PaymentMethodsFixture =>
  withMain(language, { hasCredentials: true }, 'listener');

type Answer =
  | { data: unknown }
  | {
      refused: {
        status: number;
        code: string;
        message: string;
        details?: Record<string, unknown>;
      };
    };

let made = 0;

function saved(
  row: MethodFixture,
  given: Record<string, unknown>[],
  methods: PaymentMethodsFixture,
): void {
  const wanted = given.findIndex((each) => each.active === true);
  const known = methods.methods.flatMap((each) => each.accounts);
  row.accounts = given.map((each, index) => {
    const before = known.find((one) => one.id === each.id);
    made += 1;
    return account(before?.id ?? `new-${String(made)}`, {
      ...before,
      ...(each as Partial<AccountFixture>),
      note: (each.note as string | undefined) ?? null,
      active: index === wanted,
    });
  });
}

/** The page's reads and writes, in the server's answers: most write back the methods as they now are. */
export function methodsAnswer(
  method: string,
  path: string,
  body: Record<string, unknown> | null,
  methods: PaymentMethodsFixture,
): Answer | undefined {
  const view = { methods: methods.methods, ownerPhoneVerified: methods.ownerPhoneVerified };
  if (method === 'GET' && path === '/listener/devices') {
    return { data: { devices: [], active: methods.phones ?? 0, limit: null } };
  }
  if (!path.startsWith('/payment-methods')) return undefined;
  if (method === 'GET' && path === '/payment-methods') return { data: view };

  const onAccount =
    /^\/payment-methods\/accounts\/([^/]+)\/(gateway|gateway\/test|automated)$/.exec(path);
  if (onAccount) {
    const [, id, what] = onAccount;
    const row = methods.methods.find((each) => each.accounts.some((one) => one.id === id));
    const one = row?.accounts.find((each) => each.id === id);
    if (!row || !one) {
      return { refused: { status: 404, code: 'not_found', message: 'Account not found' } };
    }
    if (what === 'gateway/test') return { data: methods.test ?? { ok: true, code: null } };
    if (what === 'automated') {
      for (const each of row.accounts) each.automated = each.id === id;
      return { data: view };
    }
    if (method === 'PUT') {
      one.hasCredentials = true;
      one.credentialsUnreadable = false;
      one.sandbox = body?.sandbox === true;
    } else {
      one.hasCredentials = false;
      one.automated = false;
    }
    return { data: { ok: true } };
  }

  const way = /^\/payment-methods\/([^/]+)\/way$/.exec(path);
  if (way && method === 'PUT') {
    const row = methods.methods.find((each) => each.method === way[1]);
    if (!row) return { refused: { status: 404, code: 'not_found', message: 'Not found' } };
    if (body?.way === 'automated' && !row.accounts.some((each) => each.automated)) {
      return { refused: { status: 409, code: 'conflict', message: 'Credentials needed' } };
    }
    row.way = body?.way as MethodFixture['way'];
    return { data: view };
  }

  const one = /^\/payment-methods\/([^/]+)$/.exec(path);
  if (one && method === 'PUT') {
    const row = methods.methods.find((each) => each.method === one[1]);
    if (!row) return { refused: { status: 404, code: 'not_found', message: 'Not found' } };
    row.enabled = body?.enabled === true;
    saved(row, (body?.accounts ?? []) as Record<string, unknown>[], methods);
    return { data: view };
  }
  return undefined;
}
