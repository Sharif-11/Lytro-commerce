import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { request as httpRequest } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { listenOn } from './support/bootstrap';
import { getJson, postJson } from './support/http';

/** Bypasses support/http.ts's automatic /api/v1 prefix, to prove the server itself enforces it. */
function rawGet(port: number, path: string): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      res.on('data', () => {
        // Response body not needed; only the status matters for this check.
      });
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0 });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Proves the real wire shape every other e2e spec's `.body`/`errorOf()` helpers quietly unwrap (support/http.ts):
// { success, statusCode, message, data } on success, { success, statusCode, message, errors: { code, details } }
// on failure (SRS-detailed §2.6). No database needed -- /health and a validation error exercise both paths.
let app: INestApplication;
let port: number;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  await app.close();
});

describe('the response envelope (API-14, SRS-detailed §2.6)', () => {
  it('wraps a success response in { success: true, statusCode, message, data }', async () => {
    const response = await getJson(port, '/health');
    expect(response.status).toBe(200);
    const envelope = response.envelope as { success: boolean; statusCode: number; message: string };
    expect(typeof envelope.message).toBe('string');
    expect(response.envelope).toMatchObject({
      success: true,
      statusCode: 200,
      data: { status: 'ok' },
    });
  });

  it('wraps a validation error in { success: false, statusCode, message, errors: { code, details } }', async () => {
    const response = await postJson(port, '/auth/phone/code', { phone: 'not-a-phone' });
    expect(response.status).toBe(400);
    const envelope = response.envelope as { message: string };
    expect(typeof envelope.message).toBe('string');
    expect(response.envelope).toMatchObject({
      success: false,
      statusCode: 400,
      errors: { code: 'validation_error', details: { field: 'phone' } },
    });
  });

  it('wraps a generic guard rejection (not an ApiError) the same way', async () => {
    const response = await getJson(port, '/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.envelope).toMatchObject({
      success: false,
      statusCode: 404,
      errors: { code: 'not_found' },
    });
  });

  it('keeps /health unversioned while a real route needs the /api/v1 prefix', async () => {
    expect((await rawGet(port, '/health')).status).toBe(200);
    expect((await rawGet(port, '/staff')).status).toBe(404); // bare, unprefixed -- no longer a real route
    const prefixed = await postJson(port, '/auth/phone/code', { phone: '01712345678' });
    expect(prefixed.status).toBe(200);
  });
});
