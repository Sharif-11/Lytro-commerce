import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { request as httpRequest } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { getJson, postJson } from './support/http';
import { SmsCapture } from './support/sms-capture';

// API-16, API-26, §2.6, I18N-01: every refusal reads as a plain sentence in the request's language -- each invalid
// field named with what is wrong and how to fix it, and no framework or parser text ever reaching a person.
// Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_error_messages_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const ENGLISH = { 'accept-language': 'en' };

let app: INestApplication;
let port: number;
const texts = new SmsCapture();

interface Envelope {
  success: false;
  statusCode: number;
  message: string;
  errors: { code: string; details: Record<string, unknown> };
}

/** A request with a body sent exactly as given, not re-encoded -- for a body that isn't valid JSON. */
function rawPost(
  path: string,
  body: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; envelope: Envelope; text: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path: `/api/v1${path}`,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          ...headers,
        },
      },
      (res) => {
        let text = '';
        res.on('data', (chunk: Buffer) => {
          text += chunk.toString();
        });
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, envelope: JSON.parse(text) as Envelope, text });
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'error-messages-e2e-otp-secret-0123456789ab';
  process.env['PLATFORM_DOMAIN'] = 'localhost';

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
});

describeIfDatabase('API-16: each invalid field, named, with what to do', () => {
  it('a missing field: Bangla by default, English when asked', async () => {
    const bangla = await postJson(port, '/auth/phone/code', {});
    expect(bangla.status).toBe(400);
    expect(bangla.envelope).toMatchObject({
      message: 'ফোন নম্বর দিন।',
      errors: {
        code: 'validation_error',
        details: { fields: [{ field: 'phone', problem: 'required', message: 'ফোন নম্বর দিন।' }] },
      },
    });

    const english = await postJson(port, '/auth/phone/code', {}, ENGLISH);
    expect(english.envelope).toMatchObject({
      message: 'Phone number is required.',
      errors: { details: { fields: [{ message: 'Phone number is required.' }] } },
    });
  });

  it('a wrong format gets an example of the right one', async () => {
    const email = await postJson(port, '/auth/email/code', { email: 'rahim@' }, ENGLISH);
    expect(email.envelope).toMatchObject({
      message: 'Enter a valid email address, like name@example.com.',
      errors: { details: { fields: [{ field: 'email', problem: 'invalid_email' }] } },
    });

    // Checked by the server itself (the schema only bounds the length), worded the same shared way.
    const phone = await postJson(port, '/auth/phone/code', { phone: '12345' }, ENGLISH);
    expect(phone.envelope).toMatchObject({
      message: 'Enter a Bangladeshi mobile number, such as 017XXXXXXXX.',
      errors: { details: { fields: [{ field: 'phone', problem: 'invalid_format' }] } },
    });
  });

  it('several invalid fields are each listed, under a count', async () => {
    const response = await postJson(port, '/auth/phone/verify', {}, ENGLISH);
    expect(response.status).toBe(400);
    expect(response.envelope).toMatchObject({
      message: '2 fields need fixing. Check the highlighted fields.',
      errors: {
        details: {
          fields: [
            { field: 'phone', problem: 'required', message: 'Phone number is required.' },
            { field: 'code', problem: 'required', message: 'Code is required.' },
          ],
        },
      },
    });
  });
});

describeIfDatabase('§2.6: what the framework and the body parser refuse is worded too', () => {
  it('a body that is not valid JSON', async () => {
    const bangla = await rawPost('/auth/phone/code', '{"phone": "017');
    expect(bangla.status).toBe(400);
    expect(bangla.envelope).toMatchObject({
      success: false,
      message: 'পাঠানো তথ্য পড়া যায়নি। আবার ট্রাই করুন।',
      errors: { code: 'validation_error', details: {} },
    });
    expect(bangla.text).not.toMatch(/JSON|position|token/i);

    const english = await rawPost('/auth/phone/code', '{"phone": "017', ENGLISH);
    expect(english.envelope.message).toBe(
      "We couldn't read the information sent. Please try again.",
    );
  });

  it('API-26: a body over 1 MB answers 413; one just under it is read normally', async () => {
    const tooBig = await rawPost(
      '/auth/email/code',
      JSON.stringify({ email: 'rahim@', pad: 'x'.repeat(1_100_000) }),
      ENGLISH,
    );
    expect(tooBig.status).toBe(413);
    expect(tooBig.envelope).toMatchObject({
      statusCode: 413,
      message: 'Too much information was sent at once. Please send less and try again.',
      errors: { code: 'validation_error' },
    });

    // Read and checked: the answer is about the email, not the size.
    const underLimit = await rawPost(
      '/auth/email/code',
      JSON.stringify({ email: 'rahim@', pad: 'x'.repeat(900_000) }),
      ENGLISH,
    );
    expect(underLimit.status).toBe(400);
    expect(underLimit.envelope.message).toBe('Enter a valid email address, like name@example.com.');
  });

  it('an unknown route', async () => {
    const bangla = await getJson(port, '/no-such-page');
    expect(bangla.status).toBe(404);
    expect(bangla.envelope).toMatchObject({
      message: 'পেজটি খুঁজে পাওয়া যায়নি।',
      errors: { code: 'not_found', details: {} },
    });
    expect(JSON.stringify(bangla.envelope)).not.toContain('Cannot GET');

    const english = await getJson(port, '/no-such-page', ENGLISH);
    expect((english.envelope as Envelope).message).toBe('Page not found.');
  });
});
