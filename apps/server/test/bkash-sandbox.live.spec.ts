import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { CredentialUseAction } from '@lytronix/validators';
import type { CredentialUse } from '../src/modules/gateway/ports/wallet-gateway';
import { BkashGateway } from '../src/modules/gateway/services/bkash-gateway';

// Phase 5 Slice 5.7: the real bKash sandbox, which only ever runs by hand on a computer holding credentials: CI uses
// test/support/fake-bkash.ts. BKASH_SANDBOX_ENV_FILE names a local file outside every repo, with BKASH_APP_KEY, BKASH_APP_SECRET,
// BKASH_USERNAME and BKASH_PASSWORD. It asks for one token a run, so run it at most twice an hour: bKash blocks the app past that.
// It prints only what bKash's own answers say about the request's shape, never a credential or a token.
const ENV_FILE = process.env['BKASH_SANDBOX_ENV_FILE'];
const describeIfCredentials = ENV_FILE ? describe : describe.skip;
const SANDBOX = 'https://tokenized.sandbox.bka.sh/v2';

function read(file: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match?.[1] && match[2] !== undefined) values[match[1]] = match[2].replace(/^"|"$/g, '');
  }
  return values;
}

/** What bKash answered, by its fields' names and its status fields' values: never a token, an ID or an address. */
function shapeOf(url: string, status: number, reply: Record<string, unknown>): string {
  const standing = ['statusCode', 'externalCode', 'transactionStatus', 'verificationStatus']
    .map((field) => {
      const value = reply[field];
      return typeof value === 'string' ? `${field}=${value}` : null;
    })
    .filter((part) => part !== null)
    .join(' ');
  const path = new URL(url).pathname.replace('/v2/tokenized-checkout', '');
  return `bkash answer ${path}: http ${String(status)}, fields ${Object.keys(reply).sort().join(' ')}, standing ${standing}`;
}

describeIfCredentials('the real bKash sandbox', () => {
  it('takes a token, starts a payment and answers where it stands, with no money moved', async () => {
    const values = read(ENV_FILE ?? '');
    const credentials = {
      appKey: values['BKASH_APP_KEY'] ?? '',
      appSecret: values['BKASH_APP_SECRET'] ?? '',
      username: values['BKASH_USERNAME'] ?? '',
      password: values['BKASH_PASSWORD'] ?? '',
    };
    // A blank value would spend one of bKash's two token calls an hour on nothing.
    expect(Object.values(credentials).every((value) => value !== '')).toBe(true);
    let idToken = '';
    const watching: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      const url = input instanceof Request ? input.url : String(input);
      const reply = (await response.clone().json()) as Record<string, unknown>;
      const token = reply['id_token'];
      if (url.endsWith('/grant-token') && typeof token === 'string') idToken = token;
      console.info(shapeOf(url, response.status, reply));
      return response;
    };
    const uses: CredentialUse[] = [];
    const gateway = new BkashGateway(
      { sandbox: SANDBOX, production: SANDBOX },
      watching,
      {
        record: (use) => {
          uses.push(use);
          return Promise.resolve();
        },
        tokenCallsSince: () => Promise.resolve(0),
      },
      () => new Date(),
    );
    const account = {
      tenantId: randomUUID(),
      accountId: randomUUID(),
      sandbox: true,
      credentials,
      sessionId: null,
    };

    await gateway.testConnection(account);
    expect(idToken).not.toBe('');

    // The documents' table says "Bearer token" while their sample sends the bare token: this says which bKash takes.
    const body = {
      payerReference: 'lytro-live-check',
      callbackURL: 'https://example.com/return',
      amount: '10.00',
      currency: 'BDT',
      intent: 'sale',
      merchantInvoiceNumber: `live${String(Date.now())}`,
    };
    for (const [form, authorization] of [
      ['bare', idToken],
      ['bearer', `Bearer ${idToken}`],
    ] as const) {
      const response = await fetch(`${SANDBOX}/tokenized-checkout/payment/create`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization,
          'x-app-key': credentials.appKey,
        },
        body: JSON.stringify(body),
      });
      const reply = (await response.json()) as {
        paymentId?: string;
        externalCode?: string;
        statusCode?: string;
      };
      console.info(
        `authorization form ${form}: http ${String(response.status)}, ` +
          `started ${String(Boolean(reply.paymentId))}, code ${reply.externalCode ?? reply.statusCode ?? 'none'}`,
      );
    }

    const started = await gateway.initiate(account, {
      amount: '10.00',
      invoice: `live${String(Date.now())}`,
      payerReference: 'lytro-live-check',
      callbackUrl: 'https://example.com/return',
    });
    expect(started.paymentId).not.toBe('');
    expect(started.redirectUrl).toMatch(/^https:\/\//);

    // Started and not paid, it stands open, and executing it moves nothing.
    expect(await gateway.verify(account, started.paymentId)).toEqual({ status: 'open' });
    expect(await gateway.execute(account, started.paymentId)).toEqual({ status: 'open' });

    expect(uses.map((use) => use.action)).toEqual(['token', 'create', 'query', 'execute']);
    expect(uses.every((use) => use.succeeded || use.action === CredentialUseAction.Execute)).toBe(
      true,
    );
  }, 120_000);
});
