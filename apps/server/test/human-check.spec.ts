import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from '../src/common/circuit-breaker';
import { TURNSTILE_TEST_SECRETS } from '../src/config/turnstile';
import {
  addressLimitsOf,
  RAISED_ADDRESS_LIMITS,
  STRICT_ADDRESS_LIMITS,
} from '../src/modules/identity/address-limits';
import { HumanCheck, SITEVERIFY_URL } from '../src/modules/identity/services/human-check';
import type { OutsideCalls } from '../src/modules/shared/outside-calls/services/outside-calls';

// SUP-08, SMS-11, AUTH-09 as amended 2026-11-20 (the owner's "Raise them + bot check"): the dashboard's Turnstile token
// on every request that texts a code, checked with Cloudflare's Siteverify. The answers below are Siteverify's own, as
// it gave them for Cloudflare's test secrets on 2026-11-20, and as its documentation gives them for a real widget.

const TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';
const IP = '203.0.113.9';

/** A real widget's answer for a token from the dashboard. */
const PASSED = {
  success: true,
  challenge_ts: '2026-11-20T12:00:00.000Z',
  hostname: 'app.lytro.app',
  action: 'signin',
  'error-codes': [],
  metadata: { interactive: false },
};
/** Siteverify's answers for the test secrets (hostname example.com, no action). */
const TEST_PASSED = {
  success: true,
  'error-codes': [],
  hostname: 'example.com',
  metadata: { result_with_testing_key: true },
};
const TEST_FAILED = {
  success: false,
  'error-codes': ['invalid-input-response'],
  messages: [],
  metadata: { result_with_testing_key: true },
};
const TEST_SPENT = {
  success: false,
  'error-codes': ['timeout-or-duplicate'],
  messages: [],
  metadata: { result_with_testing_key: true },
};

/** Siteverify as the test answers it, and what it was sent. */
class FakeSiteverify {
  asked: { url: string; form: URLSearchParams }[] = [];
  answer: () => Promise<Response> = () => Promise.resolve(Response.json(PASSED));

  readonly send = ((url: string, init: RequestInit) => {
    this.asked.push({ url, form: new URLSearchParams(init.body as URLSearchParams) });
    return this.answer();
  }) as unknown as typeof fetch;
}

function checkWith(
  siteverify: FakeSiteverify,
  secret: string | undefined = 'the-widget-secret',
  hostnames: string[] = [],
) {
  return new HumanCheck(
    { TURNSTILE_SECRET_KEY: secret, TURNSTILE_HOSTNAMES: hostnames, PLATFORM_DOMAIN: 'lytro.app' },
    siteverify.send,
  );
}

describe('the bot check on code SMS (HumanCheck)', () => {
  it('is off without the widget secret: no call, the request goes on as before', async () => {
    const siteverify = new FakeSiteverify();
    const check = new HumanCheck(
      { TURNSTILE_SECRET_KEY: undefined, TURNSTILE_HOSTNAMES: [], PLATFORM_DOMAIN: 'lytro.app' },
      siteverify.send,
    );
    expect(check.on).toBe(false);
    await expect(check.check(undefined, 'signin', IP)).resolves.toBe('off');
    await expect(check.askerFor(undefined, 'signin', IP)).resolves.toEqual({ ip: IP });
    expect(siteverify.asked).toEqual([]);
  });

  it("passes a person's token from the dashboard, sending Cloudflare the secret, the token and the address", async () => {
    const siteverify = new FakeSiteverify();
    const check = checkWith(siteverify);
    await expect(check.askerFor(TOKEN, 'signin', IP)).resolves.toEqual({ ip: IP });
    expect(siteverify.asked).toHaveLength(1);
    const [asked] = siteverify.asked;
    expect(asked?.url).toBe(SITEVERIFY_URL);
    expect(Object.fromEntries(asked?.form ?? [])).toEqual({
      secret: 'the-widget-secret',
      response: TOKEN,
      remoteip: IP,
    });
  });

  it('sends no address it cannot trust', async () => {
    const siteverify = new FakeSiteverify();
    await checkWith(siteverify).check(TOKEN, 'signin', null);
    expect(siteverify.asked[0]?.form.has('remoteip')).toBe(false);
  });

  it('refuses a request with no token, without asking Cloudflare', async () => {
    const siteverify = new FakeSiteverify();
    const check = checkWith(siteverify);
    await expect(check.askerFor(undefined, 'reset', IP)).rejects.toMatchObject({
      code: 'forbidden',
      messageKey: 'HumanCheckFailed',
    });
    await expect(check.check('', 'reset', IP)).resolves.toBe('refused');
    expect(siteverify.asked).toEqual([]);
  });

  it("refuses a token Cloudflare didn't pass, a spent one, and one from another page or request", async () => {
    const siteverify = new FakeSiteverify();
    const check = checkWith(siteverify);
    siteverify.answer = () => Promise.resolve(Response.json(TEST_FAILED));
    await expect(check.check(TOKEN, 'signin', IP)).resolves.toBe('refused');
    siteverify.answer = () => Promise.resolve(Response.json(TEST_SPENT));
    await expect(check.check(TOKEN, 'signin', IP)).resolves.toBe('refused');
    siteverify.answer = () => Promise.resolve(Response.json(PASSED));
    // The sign-in widget's token on the reset request.
    await expect(check.check(TOKEN, 'reset', IP)).resolves.toBe('refused');
    siteverify.answer = () =>
      Promise.resolve(Response.json({ ...PASSED, hostname: 'phish.example.com' }));
    await expect(check.check(TOKEN, 'signin', IP)).resolves.toBe('refused');
    siteverify.answer = () => Promise.resolve(Response.json({ ...PASSED, hostname: undefined }));
    await expect(check.check(TOKEN, 'signin', IP)).resolves.toBe('refused');
  });

  it("takes the pages it's told, else the dashboard on the platform's domain", async () => {
    const siteverify = new FakeSiteverify();
    siteverify.answer = () =>
      Promise.resolve(Response.json({ ...PASSED, hostname: 'app.staging.lytro.app' }));
    await expect(checkWith(siteverify).check(TOKEN, 'signin', IP)).resolves.toBe('refused');
    await expect(
      checkWith(siteverify, 'the-widget-secret', ['app.staging.lytro.app']).check(
        TOKEN,
        'signin',
        IP,
      ),
    ).resolves.toBe('passed');
  });

  it("with Cloudflare's test secrets, only the verdict counts (no page, no action)", async () => {
    const siteverify = new FakeSiteverify();
    const check = checkWith(siteverify, TURNSTILE_TEST_SECRETS.passes);
    siteverify.answer = () => Promise.resolve(Response.json(TEST_PASSED));
    await expect(check.check(TOKEN, 'reset', IP)).resolves.toBe('passed');
    siteverify.answer = () => Promise.resolve(Response.json(TEST_FAILED));
    await expect(check.check(TOKEN, 'reset', IP)).resolves.toBe('refused');
  });

  it('while Cloudflare cannot say, the request goes on under the strict per-address limit', async () => {
    const answers: (() => Promise<Response>)[] = [
      () => Promise.reject(new TypeError('fetch failed')),
      () => Promise.reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' })),
      () => Promise.resolve(new Response('Bad gateway', { status: 502 })),
      () => Promise.resolve(new Response('<html>', { status: 200 })),
      // Our own secret is wrong: ours to fix, not the visitor's.
      () =>
        Promise.resolve(
          Response.json(
            { success: false, 'error-codes': ['invalid-input-secret'] },
            { status: 400 },
          ),
        ),
      () => Promise.resolve(Response.json({ success: false, 'error-codes': ['internal-error'] })),
    ];
    for (const answer of answers) {
      const siteverify = new FakeSiteverify();
      siteverify.answer = answer;
      const check = checkWith(siteverify);
      await expect(check.check(TOKEN, 'signin', IP)).resolves.toBe('unreachable');
      await expect(check.askerFor(TOKEN, 'signin', IP)).resolves.toEqual({
        ip: IP,
        ipCap: STRICT_ADDRESS_LIMITS.codeSmsPerHour,
      });
    }
  });

  it('goes through its own circuit: five failures in a row open it, and no call is made while it is open', async () => {
    const siteverify = new FakeSiteverify();
    siteverify.answer = () => Promise.reject(new TypeError('fetch failed'));
    const breakers: string[] = [];
    const outside = {
      breaker: (service: string) => {
        breakers.push(service);
        return new CircuitBreaker({ service });
      },
    } as unknown as OutsideCalls;
    const check = new HumanCheck(
      {
        TURNSTILE_SECRET_KEY: 'the-widget-secret',
        TURNSTILE_HOSTNAMES: [],
        PLATFORM_DOMAIN: 'lytro.app',
      },
      siteverify.send,
      outside,
    );
    expect(breakers).toEqual(['turnstile']);
    for (let i = 0; i < 5; i += 1) await check.check(TOKEN, 'signin', IP);
    expect(siteverify.asked).toHaveLength(5);
    await expect(check.check(TOKEN, 'signin', IP)).resolves.toBe('unreachable');
    expect(siteverify.asked).toHaveLength(5);
  });
});

describe('the per-address limits (SUP-08, SMS-11, AUTH-09 as amended 2026-11-20)', () => {
  it('production keeps the strict values until the bot check is on, then raises them', () => {
    expect(addressLimitsOf({ NODE_ENV: 'production', TURNSTILE_SECRET_KEY: undefined })).toEqual({
      signupsPerHour: 10,
      codeSmsPerHour: 20,
      trialsPerWindow: 1,
    });
    expect(addressLimitsOf({ NODE_ENV: 'production', TURNSTILE_SECRET_KEY: 'secret' })).toEqual({
      signupsPerHour: 200,
      codeSmsPerHour: 200,
      trialsPerWindow: 1000,
    });
    expect(RAISED_ADDRESS_LIMITS).not.toBe(STRICT_ADDRESS_LIMITS);
  });

  it('development and the test suites keep their loose values either way', () => {
    for (const secret of [undefined, 'secret'])
      expect(addressLimitsOf({ NODE_ENV: 'test', TURNSTILE_SECRET_KEY: secret })).toEqual({
        signupsPerHour: 1000,
        codeSmsPerHour: 1000,
        trialsPerWindow: 1000,
      });
  });
});
