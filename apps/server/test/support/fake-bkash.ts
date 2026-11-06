import { randomBytes } from 'node:crypto';

export interface BkashCall {
  url: string;
  path: string;
  appKey: string;
  authorization: string | undefined;
  username: string | undefined;
  password: string | undefined;
  body: Record<string, unknown>;
}

interface FakePayment {
  paymentId: string;
  appKey: string;
  amount: string;
  state: 'initiated' | 'authorised' | 'completed';
  trxId: string;
}

interface Behaviour {
  /** Creating a payment is refused, in bKash's own words. */
  refuseCreate?: boolean;
  /** Nothing can be reached at all. */
  unreachable?: boolean;
  /** Execute answers nothing in time, though the money moved. */
  executeTimesOut?: boolean;
  /** Execute is refused, though the money moved. */
  executeRefused?: boolean;
  /** Asking after a payment answers nothing in time. */
  queryTimesOut?: boolean;
  /** How a completed answer names its transaction, when not as the documents say. */
  trxField?: 'trxID' | 'none';
  /** What arrives at execute, when it isn't what was asked. */
  paidAmount?: string;
  /** Runs while execute is under way, once the money has moved: what staff or the shopper did in that moment. */
  duringExecute?: () => Promise<void>;
  /** The transaction ID bKash gives, when a test needs it to be a certain one. */
  trxId?: string;
}

export const RIGHT_SECRET = 'the-right-app-secret';
export const BKASH_SECRET_WORDS = 'bKash internal wording that must stay inside';
const CREATE_PATH = '/tokenized-checkout/payment/create';
const EXECUTE_PATH = '/tokenized-checkout/payment/execute';
const QUERY_PATH = '/tokenized-checkout/query/payment';
const GRANT_PATH = '/tokenized-checkout/auth/grant-token';
const REFRESH_PATH = '/tokenized-checkout/auth/refresh-token';

/** As the real sandbox: a refusal comes with its code and an HTTP 400. */
function answer(body: Record<string, unknown>): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 'externalCode' in body ? 400 : 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

function transactionField(payment: FakePayment, behaviour: Behaviour): Record<string, string> {
  if (behaviour.trxField === 'none') return {};
  return { [behaviour.trxField ?? 'trxId']: payment.trxId };
}

/**
 * bKash's Tokenized Checkout as its documents describe it, standing in for the real one where this suite reaches for `fetch`: a token
 * per app key, a payment that money only moves on at execute, and one execute per payment. Tests tell apart their shops by app key.
 */
export class FakeBkash {
  readonly calls: BkashCall[] = [];
  private readonly behaviours = new Map<string, Behaviour>();
  private readonly payments = new Map<string, FakePayment>();
  private readonly tokens = new Map<string, string>();
  private readonly refreshTokens = new Map<string, string>();

  behave(appKey: string, behaviour: Behaviour): void {
    this.behaviours.set(appKey, behaviour);
  }

  callsOf(appKey: string, path?: string): BkashCall[] {
    return this.calls.filter((call) => call.appKey === appKey && (!path || call.path === path));
  }

  grantsOf(appKey: string): BkashCall[] {
    return this.callsOf(appKey, GRANT_PATH);
  }

  refreshesOf(appKey: string): BkashCall[] {
    return this.callsOf(appKey, REFRESH_PATH);
  }

  createsOf(appKey: string): BkashCall[] {
    return this.callsOf(appKey, CREATE_PATH);
  }

  executesOf(appKey: string): BkashCall[] {
    return this.callsOf(appKey, EXECUTE_PATH);
  }

  queriesOf(appKey: string): BkashCall[] {
    return this.callsOf(appKey, QUERY_PATH);
  }

  /** The shopper put in their PIN on bKash's page: the payment is ready to execute. */
  authorise(paymentId: string): void {
    const payment = this.payments.get(paymentId);
    if (!payment) throw new Error('no such fake payment');
    payment.state = 'authorised';
  }

  /** The money moved, whatever this server heard of it. */
  complete(paymentId: string): void {
    const payment = this.payments.get(paymentId);
    if (!payment) throw new Error('no such fake payment');
    payment.state = 'completed';
  }

  readonly fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    const path = new URL(url).pathname.replace(/^\/v2/, '');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<
      string,
      unknown
    >;
    const appKey = typeof body['app_key'] === 'string' ? body['app_key'] : headers['x-app-key'];
    const call: BkashCall = {
      url,
      path,
      appKey: appKey ?? '',
      authorization: headers['authorization'],
      username: headers['username'],
      password: headers['password'],
      body,
    };
    this.calls.push(call);
    const behaviour = this.behaviours.get(call.appKey) ?? {};
    if (behaviour.unreachable) return Promise.reject(new TypeError('fetch failed'));
    if (path === GRANT_PATH || path === REFRESH_PATH) return this.token(call);
    if (!call.authorization || this.tokens.get(call.authorization) !== call.appKey) {
      return answer({ externalCode: '2079', errorMessageEn: 'Invalid token' });
    }
    if (path === CREATE_PATH) return this.create(call, behaviour);
    if (path === EXECUTE_PATH) return this.execute(call, behaviour);
    if (path === QUERY_PATH) return this.query(call, behaviour);
    return answer({ externalCode: '404', errorMessageEn: 'No such path' });
  };

  private token(call: BkashCall): Promise<Response> {
    if (call.body['app_secret'] !== RIGHT_SECRET) {
      return answer({ statusCode: '2001', statusMessage: BKASH_SECRET_WORDS });
    }
    if (
      call.path === REFRESH_PATH &&
      this.refreshTokens.get(String(call.body['refresh_token'])) !== call.appKey
    ) {
      return answer({ statusCode: '2079', statusMessage: 'Invalid refresh token' });
    }
    const idToken = `id-${randomBytes(6).toString('hex')}`;
    const refreshToken = `refresh-${randomBytes(6).toString('hex')}`;
    this.tokens.set(idToken, call.appKey);
    this.refreshTokens.set(refreshToken, call.appKey);
    return answer({
      statusCode: '0000',
      statusMessage: 'Successful',
      id_token: idToken,
      refresh_token: refreshToken,
      expires_in: 3600,
      token_type: 'Bearer',
    });
  }

  private create(call: BkashCall, behaviour: Behaviour): Promise<Response> {
    if (behaviour.refuseCreate) {
      return answer({ externalCode: '2001', errorMessageEn: BKASH_SECRET_WORDS });
    }
    const paymentId = `TR${randomBytes(8).toString('hex')}`;
    this.payments.set(paymentId, {
      paymentId,
      appKey: call.appKey,
      amount: String(call.body['amount']),
      state: 'initiated',
      trxId: behaviour.trxId ?? randomBytes(5).toString('hex').toUpperCase(),
    });
    return answer({
      paymentId,
      bkashURL: `https://payment.bkash.test/checkout?paymentId=${paymentId}`,
      transactionStatus: 'Initiated',
      amount: call.body['amount'],
      currency: 'BDT',
    });
  }

  private async execute(call: BkashCall, behaviour: Behaviour): Promise<Response> {
    const payment = this.paymentOf(call);
    if (!payment) return answer({ externalCode: '2002', errorMessageEn: 'Invalid payment ID' });
    if (payment.state === 'completed') {
      return answer({ externalCode: '2062', errorMessageEn: 'Already completed' });
    }
    if (payment.state !== 'authorised') {
      return answer({ externalCode: '2056', errorMessageEn: 'Invalid payment state' });
    }
    payment.state = 'completed';
    await behaviour.duringExecute?.();
    if (behaviour.executeTimesOut) {
      return Promise.reject(new DOMException('The operation timed out', 'TimeoutError'));
    }
    if (behaviour.executeRefused) {
      return answer({ externalCode: '9999', errorMessageEn: 'System error' });
    }
    return answer({
      paymentId: payment.paymentId,
      ...transactionField(payment, behaviour),
      transactionStatus: 'Completed',
      amount: behaviour.paidAmount ?? payment.amount,
      currency: 'BDT',
      intent: 'sale',
      payerAccount: '01811000002',
    });
  }

  private query(call: BkashCall, behaviour: Behaviour): Promise<Response> {
    const payment = this.paymentOf(call);
    if (!payment) return answer({ externalCode: '2002', errorMessageEn: 'Invalid payment ID' });
    if (behaviour.queryTimesOut) {
      return Promise.reject(new DOMException('The operation timed out', 'TimeoutError'));
    }
    const completed = payment.state === 'completed';
    return answer({
      paymentId: payment.paymentId,
      transactionStatus: completed ? 'Completed' : 'Initiated',
      verificationStatus: payment.state === 'initiated' ? 'Incomplete' : 'Complete',
      amount: behaviour.paidAmount ?? payment.amount,
      ...(completed
        ? { ...transactionField(payment, behaviour), payerAccount: '01811000002' }
        : {}),
    });
  }

  private paymentOf(call: BkashCall): FakePayment | undefined {
    const payment = this.payments.get(String(call.body['paymentId']));
    return payment?.appKey === call.appKey ? payment : undefined;
  }
}
