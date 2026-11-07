import { describe, expect, it } from 'vitest';
import { RateKey } from '@lytronix/validators';
import { CircuitBreaker, CircuitOpen } from '../src/common/circuit-breaker';
import { EnvironmentParser } from '../src/config/env';
import type { RateService } from '../src/modules/balance/services/rate.service';
import {
  BulkSmsBdProvider,
  bulkSmsBdNumber,
  type SmsFetch,
  SmsRefused,
} from '../src/modules/shared/messaging/providers/bulksmsbd.provider';
import { ConsoleSmsProvider } from '../src/modules/shared/messaging/providers/console-sms.provider';
import {
  smsModeOf,
  smsProviderFor,
} from '../src/modules/shared/messaging/providers/sms-provider-choice';
import { SmsUnits } from '../src/modules/sms-usage/services/sms-units';

// D7-2, D7-13, D7-21 (Phase 7 Slice 7.1): the SMS that really goes out -- BulkSMSBD's API against a fake, the three
// modes a server runs SMS in, the settings that guard them, and the one unit count.
const SETTINGS = {
  baseUrl: 'https://bulksms.test/api',
  apiKey: 'test-key-0',
  senderId: '8809617600000',
};
const CODE_TEXT = 'Lytro-এ লগইনের জন্য OTP হচ্ছে 123456। কারো সাথে শেয়ার করবেন না।';

interface Call {
  url: string;
  init: RequestInit;
}

/** A BulkSMSBD that gives these answers in turn: a JSON body, raw text, or a network failure. */
function fakeBulkSms(answers: (object | string | Error)[]): { fetch: SmsFetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchSms: SmsFetch = (url, init) => {
    calls.push({ url, init });
    const answer = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (answer instanceof Error) return Promise.reject(answer);
    const body = typeof answer === 'string' ? answer : JSON.stringify(answer);
    return Promise.resolve(new Response(body, { status: typeof answer === 'string' ? 500 : 200 }));
  };
  return { fetch: fetchSms, calls };
}

const SENT = {
  response_code: 202,
  message_id: 51234,
  success_message: 'SMS Submitted Successfully',
};

describe('D7-2: BulkSMSBD over HTTPS', () => {
  it('posts the form BulkSMSBD asks for, with the key in the body and the number as 8801', async () => {
    const fake = fakeBulkSms([SENT]);
    const provider = new BulkSmsBdProvider(SETTINGS, fake.fetch);
    expect(await provider.send({ toPhone: '01711111111', body: CODE_TEXT })).toEqual({
      providerMessageId: '51234',
    });
    expect(fake.calls).toHaveLength(1);
    const call = fake.calls[0];
    expect(call?.url).toBe('https://bulksms.test/api/smsapi');
    expect(call?.url).not.toContain(SETTINGS.apiKey);
    expect(call?.init.method).toBe('POST');
    expect(call?.init.headers).toEqual({ 'content-type': 'application/x-www-form-urlencoded' });
    expect(call?.init.signal).toBeInstanceOf(AbortSignal);
    expect(Object.fromEntries(new URLSearchParams(call?.init.body as string))).toEqual({
      api_key: SETTINGS.apiKey,
      type: 'text',
      number: '8801711111111',
      senderid: SETTINGS.senderId,
      message: CODE_TEXT,
    });
  });

  it('takes a sent SMS with no message ID as sent', async () => {
    const fake = fakeBulkSms([{ response_code: 202 }]);
    expect(
      await new BulkSmsBdProvider(SETTINGS, fake.fetch).send({ toPhone: '01711111111', body: 'x' }),
    ).toEqual({ providerMessageId: null });
  });

  it('throws its refusal, saying what it means, and never the key', async () => {
    const fake = fakeBulkSms([{ response_code: 1007, error_message: 'Balance Insufficient' }]);
    const provider = new BulkSmsBdProvider(SETTINGS, fake.fetch);
    const refused = await provider
      .send({ toPhone: '01711111111', body: 'x' })
      .catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(SmsRefused);
    expect((refused as SmsRefused).code).toBe(1007);
    expect((refused as SmsRefused).message).toContain("Lytro's BulkSMSBD balance is used up");
    expect((refused as SmsRefused).message).not.toContain(SETTINGS.apiKey);
  });

  it('says an unknown refusal by its number', async () => {
    const fake = fakeBulkSms([{ response_code: 1099 }]);
    await expect(
      new BulkSmsBdProvider(SETTINGS, fake.fetch).send({ toPhone: '01711111111', body: 'x' }),
    ).rejects.toThrow(/1099.*unknown code/);
  });

  it('PRF-05: a refusal is an answer, so refusals never open the circuit', async () => {
    const fake = fakeBulkSms([...Array.from({ length: 6 }, () => ({ response_code: 1001 })), SENT]);
    const provider = new BulkSmsBdProvider(SETTINGS, fake.fetch, new CircuitBreaker());
    for (let index = 0; index < 6; index += 1) {
      await expect(provider.send({ toPhone: '01711111111', body: 'x' })).rejects.toBeInstanceOf(
        SmsRefused,
      );
    }
    expect(await provider.send({ toPhone: '01711111111', body: 'x' })).toEqual({
      providerMessageId: '51234',
    });
  });

  it('PRF-05: no answer, or one with no JSON, counts against the circuit until it opens', async () => {
    const fake = fakeBulkSms([
      '<html>Bad Gateway</html>',
      new Error('connect ECONNREFUSED'),
      '<html>Bad Gateway</html>',
      new Error('connect ECONNREFUSED'),
      '<html>Bad Gateway</html>',
    ]);
    const provider = new BulkSmsBdProvider(SETTINGS, fake.fetch, new CircuitBreaker());
    const first = await provider
      .send({ toPhone: '01711111111', body: 'x' })
      .catch((e: unknown) => e);
    expect((first as Error).message).toBe('BulkSMSBD answered HTTP 500 with no JSON');
    for (let index = 1; index < 5; index += 1) {
      await expect(provider.send({ toPhone: '01711111111', body: 'x' })).rejects.toThrow();
    }
    await expect(provider.send({ toPhone: '01711111111', body: 'x' })).rejects.toBeInstanceOf(
      CircuitOpen,
    );
    expect(fake.calls).toHaveLength(5);
  });

  it('is only ever built for an https address', () => {
    expect(
      () => new BulkSmsBdProvider({ ...SETTINGS, baseUrl: 'http://bulksmsbd.net/api' }, fetch),
    ).toThrow(/HTTPS/);
  });

  it("writes Lytro's 01 numbers as 8801, and leaves the rest for BulkSMSBD to judge", () => {
    expect(bulkSmsBdNumber('01711111111')).toBe('8801711111111');
    expect(bulkSmsBdNumber('+8801711111111')).toBe('8801711111111');
    expect(bulkSmsBdNumber('8801711111111')).toBe('8801711111111');
    expect(bulkSmsBdNumber('0171111')).toBe('0171111');
  });
});

describe('D7-21: where an SMS goes depends on the mode', () => {
  const LOGIN = { BULKSMSBD_API_KEY: 'key', BULKSMSBD_SENDER_ID: 'sender' };
  const BASE_URL = 'https://bulksmsbd.net/api';

  it('records in tests, logs in development unless forced, and sends in production', () => {
    expect(smsModeOf({ NODE_ENV: 'test', SMS_FORCE_REAL: true })).toBe('record');
    expect(smsModeOf({ NODE_ENV: 'development', SMS_FORCE_REAL: false })).toBe('log');
    expect(smsModeOf({ NODE_ENV: 'development', SMS_FORCE_REAL: true })).toBe('send');
    expect(smsModeOf({ NODE_ENV: 'production', SMS_FORCE_REAL: false })).toBe('send');
  });

  it('builds the stand-in unless it sends, and BulkSMSBD when it does', () => {
    expect(
      smsProviderFor(
        { NODE_ENV: 'development', SMS_FORCE_REAL: false, BULKSMSBD_BASE_URL: BASE_URL, ...LOGIN },
        fetch,
      ),
    ).toBeInstanceOf(ConsoleSmsProvider);
    expect(
      smsProviderFor(
        { NODE_ENV: 'development', SMS_FORCE_REAL: true, BULKSMSBD_BASE_URL: BASE_URL, ...LOGIN },
        fetch,
      ),
    ).toBeInstanceOf(BulkSmsBdProvider);
    expect(
      smsProviderFor(
        { NODE_ENV: 'production', SMS_FORCE_REAL: false, BULKSMSBD_BASE_URL: BASE_URL, ...LOGIN },
        fetch,
      ),
    ).toBeInstanceOf(BulkSmsBdProvider);
  });

  it('never falls back to the stand-in when it should send and has no login', () => {
    expect(() =>
      smsProviderFor(
        { NODE_ENV: 'production', SMS_FORCE_REAL: false, BULKSMSBD_BASE_URL: BASE_URL },
        fetch,
      ),
    ).toThrow(/BULKSMSBD_API_KEY/);
  });
});

describe("D7-21: the settings guard BulkSMSBD's login", () => {
  const SECRET = 'x'.repeat(32);
  const BASE = { DATABASE_URL: 'postgres://db', OTP_SECRET: SECRET };
  const PRODUCTION = {
    ...BASE,
    NODE_ENV: 'production',
    TRUSTED_EDGE_SECRET: SECRET,
    STOREFRONT_SECRET: SECRET,
    DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    PLATFORM_ADDRESSES: '203.0.113.10',
    // Phase 7 Slice 7.6 (D7-22): production reads messages with Gemini too.
    GEMINI_API_KEY: 'key',
    // Phase 7 Slice 7.3 (D7-22): and emails through Resend.
    RESEND_API_KEY: 'key',
    RESEND_WEBHOOK_SECRET: 'whsec_c2VjcmV0',
    VAPID_PUBLIC_KEY:
      'BBNykCoCcw3zvOh_47IKoxj6iE_nq2XIoPa-8QseO0wXT-0DXUxzLKt8gHBkgX1F6QGkLVde6Love1mB84r11Jw',
    VAPID_PRIVATE_KEY: 'rieyYsQvtJt6S0zEMB1SPZjCnUegO-FIvwL4XR2gFNw',
  };

  it('refuses production, staging included, without the key and the sender ID', () => {
    expect(() => new EnvironmentParser().parse(PRODUCTION)).toThrow(
      /BULKSMSBD_API_KEY: required in production.*BULKSMSBD_SENDER_ID: required in production/,
    );
    const env = new EnvironmentParser().parse({
      ...PRODUCTION,
      BULKSMSBD_API_KEY: 'key',
      BULKSMSBD_SENDER_ID: 'sender',
    });
    expect(env.BULKSMSBD_BASE_URL).toBe('https://bulksmsbd.net/api');
  });

  it('logs in development by default, needing no login', () => {
    const env = new EnvironmentParser().parse(BASE);
    expect(env.SMS_FORCE_REAL).toBe(false);
    expect(env.BULKSMSBD_API_KEY).toBeUndefined();
  });

  it('refuses SMS_FORCE_REAL without the login, and anything but true or false', () => {
    expect(() => new EnvironmentParser().parse({ ...BASE, SMS_FORCE_REAL: 'true' })).toThrow(
      /BULKSMSBD_API_KEY: required when SMS_FORCE_REAL is set/,
    );
    expect(
      new EnvironmentParser().parse({
        ...BASE,
        SMS_FORCE_REAL: 'true',
        BULKSMSBD_API_KEY: 'key',
        BULKSMSBD_SENDER_ID: 'sender',
      }).SMS_FORCE_REAL,
    ).toBe(true);
    expect(() => new EnvironmentParser().parse({ ...BASE, SMS_FORCE_REAL: 'yes' })).toThrow(
      /SMS_FORCE_REAL/,
    );
  });

  it('refuses a BulkSMSBD address that is not https', () => {
    expect(() =>
      new EnvironmentParser().parse({ ...BASE, BULKSMSBD_BASE_URL: 'http://bulksmsbd.net/api' }),
    ).toThrow(/BULKSMSBD_BASE_URL: must be an https address/);
  });
});

describe('SMS-09, D7-13: one unit count, whatever the language', () => {
  const units = new SmsUnits({
    current: (key: RateKey) =>
      Promise.resolve({ value: key === RateKey.SmsPerUnit ? '0.5500' : '67.0000' }),
  } as unknown as RateService);

  it('counts characters over 67, at least one unit, at the SMS rate', async () => {
    expect(await units.priceOf('')).toEqual({ units: 1, rate: '0.5500' });
    expect(await units.priceOf('a'.repeat(67))).toEqual({ units: 1, rate: '0.5500' });
    expect((await units.priceOf('a'.repeat(68))).units).toBe(2);
    expect((await units.priceOf('ক'.repeat(67))).units).toBe(1);
    expect((await units.priceOf('ক'.repeat(135))).units).toBe(3);
    expect((await units.priceOf(CODE_TEXT)).units).toBe(1);
  });
});

// Sends one real SMS, at about 0.35 TK: run it by hand with the login and a phone set, never in CI.
const live = process.env['SMS_LIVE_TEST_PHONE'];
describe.skipIf(!live || !process.env['BULKSMSBD_API_KEY'] || !process.env['BULKSMSBD_SENDER_ID'])(
  'D7-2: one real SMS through BulkSMSBD (by hand only)',
  () => {
    it('is taken and given an ID', async () => {
      const provider = new BulkSmsBdProvider(
        {
          baseUrl: process.env['BULKSMSBD_BASE_URL'] ?? 'https://bulksmsbd.net/api',
          apiKey: process.env['BULKSMSBD_API_KEY'] ?? '',
          senderId: process.env['BULKSMSBD_SENDER_ID'] ?? '',
        },
        (url, init) => fetch(url, init),
      );
      const sent = await provider.send({ toPhone: live ?? '', body: CODE_TEXT });
      expect(sent.providerMessageId).not.toBeNull();
    });
  },
);
