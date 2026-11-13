import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { GatewayAnswerAction } from '@lytronix/validators';
import type { CredentialUse, GatewayAnswer } from '../src/modules/gateway/ports/wallet-gateway';
import { BkashGateway } from '../src/modules/gateway/services/bkash-gateway';
import { SharedGatewayTokens } from '../src/modules/gateway/services/shared-gateway-tokens';
import { FakeBkash, RIGHT_SECRET } from './support/fake-bkash';

// DAT-51, D9-16 (Phase 9 Slice 9.5): a wallet gateway sends no message of its own, so what stands for its callback is its
// answer to each execute and query, kept as it came before the caller acts on it. Creating a checkout says nothing about
// money and keeps nothing.

const BASE = 'https://tokenized.bkash.test/v2';

function gatewayWith(bkash: FakeBkash, kept: GatewayAnswer[], failKeeping = false): BkashGateway {
  const uses: CredentialUse[] = [];
  return new BkashGateway(
    { sandbox: BASE, production: BASE },
    bkash.fetch,
    {
      record: (use) => {
        uses.push(use);
        return Promise.resolve();
      },
      tokenCallsSince: () => Promise.resolve(0),
      keepAnswer: (answer) => {
        if (failKeeping) return Promise.reject(new Error('the database is down'));
        kept.push(answer);
        return Promise.resolve();
      },
    },
    () => new Date(),
    new SharedGatewayTokens(
      null,
      { seal: () => Buffer.alloc(0), open: () => '' },
      { inTurn: async (_key, _lease, _wait, work) => ({ held: true, value: await work() }) },
    ),
  );
}

function accountFor(sessionId: string) {
  return {
    tenantId: randomUUID(),
    accountId: randomUUID(),
    sandbox: true,
    credentials: {
      appKey: `app-${randomUUID().slice(0, 8)}`,
      appSecret: RIGHT_SECRET,
      username: 'sandbox-user',
      password: 'sandbox-pass-word',
    },
    sessionId,
  };
}

async function started(gateway: BkashGateway, account: ReturnType<typeof accountFor>) {
  return gateway.initiate(account, {
    amount: '500',
    invoice: 'INV-1',
    payerReference: '01700000000',
    callbackUrl: 'https://pay.localhost/v1/pay/ref/gateway-return',
  });
}

describe("a gateway's answers kept as they came (DAT-51)", () => {
  it('keeps the execute and the query answers, each naming its session and payment, and not the checkout made', async () => {
    const bkash = new FakeBkash();
    const kept: GatewayAnswer[] = [];
    const gateway = gatewayWith(bkash, kept);
    const sessionId = randomUUID();
    const account = accountFor(sessionId);

    const checkout = await started(gateway, account);
    expect(kept).toEqual([]);

    bkash.authorise(checkout.paymentId);
    const executed = await gateway.execute(account, checkout.paymentId);
    expect(executed.status).toBe('completed');
    const queried = await gateway.verify(account, checkout.paymentId);
    expect(queried.status).toBe('completed');

    expect(kept.map((answer) => [answer.action, answer.transactionStatus])).toEqual([
      [GatewayAnswerAction.Execute, 'Completed'],
      [GatewayAnswerAction.Query, 'Completed'],
    ]);
    for (const answer of kept) {
      expect(answer).toMatchObject({
        tenantId: account.tenantId,
        sessionId,
        paymentId: checkout.paymentId,
      });
      // The answer as it came: bKash's own fields, the transaction among them.
      expect(JSON.parse(answer.answer)).toMatchObject({ transactionStatus: 'Completed' });
    }
  });

  it('acts on no answer it could not keep: the call fails, for the minute pass to ask again', async () => {
    const bkash = new FakeBkash();
    const kept: GatewayAnswer[] = [];
    const account = accountFor(randomUUID());
    const checkout = await started(gatewayWith(bkash, kept), account);
    bkash.authorise(checkout.paymentId);
    await expect(
      gatewayWith(bkash, kept, true).execute(account, checkout.paymentId),
    ).rejects.toThrow('the database is down');
  });
});
