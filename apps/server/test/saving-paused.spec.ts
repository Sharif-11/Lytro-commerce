import type { ArgumentsHost, ExecutionContext } from '@nestjs/common';
import type { DatabaseHandle, DatabaseProbe } from '@lytronix/db';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/common/api-error';
import { ApiErrorFilter } from '../src/common/api-error.filter';
import { SAVING_RETRY_AFTER_SECONDS, SavingGuard } from '../src/common/guards/saving.guard';
import type { RequestErrors } from '../src/common/request-id/request-errors';
import { type DatabaseState, PrimaryWatch } from '../src/database/primary-watch';
import { ReadyController } from '../src/modules/health/ready.controller';

// Slice 9.2 (D9-14, D9-21, DAT-42, DAT-44, DAT-47): what the server does when its database can't save. The watch
// knows what each pool reaches; the ready check says whether to send this process requests; a write is refused with a
// retry hint, in the owner's words, while reads go on; and a connection lost under a request is answered the same way.

type Answer = 'primary' | 'standby' | Error;

function watchOver(writes: Answer, reads?: Answer): PrimaryWatch {
  const writePool = { db: 'write' } as unknown as DatabaseHandle;
  const readPool = reads === undefined ? writePool : ({ db: 'read' } as unknown as DatabaseHandle);
  const probe = {
    serving: (db: unknown) => {
      const answer = db === 'read' ? reads : writes;
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
  } as unknown as DatabaseProbe;
  return new PrimaryWatch({ handle: writePool, reads: readPool }, probe);
}

const lost = (): Error =>
  Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });

describe('the write pool watch (DAT-44)', () => {
  it('can save while the write pool reaches the primary', async () => {
    const watch = watchOver('primary');
    expect(await watch.check()).toEqual({ writes: 'primary', reads: 'up' });
    expect(watch.canSave()).toBe(true);
  });

  it('cannot save when the write pool reaches nothing, and reads go on from their own pool', async () => {
    const watch = watchOver(lost(), 'standby');
    expect(await watch.check()).toEqual({ writes: 'unreachable', reads: 'up' });
    expect(watch.canSave()).toBe(false);
  });

  it('never saves on a standby the write pool reaches by mistake', async () => {
    const watch = watchOver('standby');
    expect(await watch.check()).toEqual({ writes: 'standby', reads: 'up' });
    expect(watch.canSave()).toBe(false);
  });

  it('with one pool, reads are down when writes are', async () => {
    expect(await watchOver(lost()).check()).toEqual({ writes: 'unreachable', reads: 'down' });
  });
});

describe('the ready check (D9-21, DAT-44)', () => {
  async function ready(state: DatabaseState): Promise<{ status: number; body: unknown }> {
    let status = 200;
    const body = await new ReadyController({ check: () => Promise.resolve(state) }).ready({
      status: (code: number) => (status = code),
    });
    return { status, body };
  }

  it('is ready on the primary', async () => {
    expect(await ready({ writes: 'primary', reads: 'up' })).toEqual({
      status: 200,
      body: {
        status: 'ready',
        database: { writes: 'primary', reads: 'up' },
        redis: 'not_configured',
      },
    });
  });

  it('stays ready to serve reads while writes reach nothing', async () => {
    expect((await ready({ writes: 'unreachable', reads: 'up' })).status).toBe(200);
  });

  it('is not ready when nothing answers, or when writes would land on a standby', async () => {
    expect((await ready({ writes: 'unreachable', reads: 'down' })).status).toBe(503);
    expect((await ready({ writes: 'standby', reads: 'up' })).status).toBe(503);
  });
});

describe('a write while the database cannot save (DAT-42, DAT-47)', () => {
  const context = (method: string): ExecutionContext =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => ({ method }) }),
    }) as unknown as ExecutionContext;

  it('is refused with a retry hint, and reads go on', () => {
    const guard = new SavingGuard({ canSave: () => false });
    expect(guard.canActivate(context('GET'))).toBe(true);
    expect(guard.canActivate(context('HEAD'))).toBe(true);
    expect(() => guard.canActivate(context('POST'))).toThrow(ApiError);
    try {
      guard.canActivate(context('PATCH'));
    } catch (error) {
      expect(error).toMatchObject({
        code: 'service_unavailable',
        messageKey: 'SavingPaused',
        retryAfterSeconds: SAVING_RETRY_AFTER_SECONDS,
      });
    }
  });

  it('goes ahead while it can save', () => {
    expect(new SavingGuard({ canSave: () => true }).canActivate(context('POST'))).toBe(true);
  });
});

describe('a database connection lost under a request (DAT-42)', () => {
  function answer(method: string, exception: unknown, lang = 'en') {
    const check = vi.fn(() => Promise.resolve({ writes: 'unreachable', reads: 'down' } as const));
    const errors = { unavailable: vi.fn(), fault: vi.fn() } as unknown as RequestErrors;
    const headers: Record<string, string> = {};
    let status = 0;
    let body: unknown;
    const response = {
      setHeader: (name: string, value: string) => (headers[name] = value),
      status: (code: number) => {
        status = code;
        return { json: (value: unknown) => (body = value) };
      },
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ method, headers: { 'accept-language': lang } }),
      }),
    } as unknown as ArgumentsHost;
    new ApiErrorFilter(errors, { check }).catch(exception, host);
    return { status, headers, body, check };
  }

  it("is a 503 with a retry hint, in the owner's words for a write, and checks again at once", () => {
    const wrapped = new Error('Failed query', { cause: lost() });
    const result = answer('POST', wrapped);
    expect(result.status).toBe(503);
    expect(result.headers['Retry-After']).toBe(String(SAVING_RETRY_AFTER_SECONDS));
    expect(result.body).toMatchObject({
      statusCode: 503,
      message:
        "Because of a problem, changes won't be saved for a few minutes. Please try again shortly.",
      errors: { code: 'service_unavailable' },
    });
    expect(result.check).toHaveBeenCalledOnce();
  });

  it('is worded in Bangla for a Bangla request, and never says "read-only"', () => {
    const result = answer('POST', { code: '57P01' }, 'bn');
    expect(result.body).toMatchObject({
      message:
        'একটা সমস্যার কারণে কয়েক মিনিট কোনো পরিবর্তন সেভ হবে না। একটু পরে আবার চেষ্টা করুন।',
    });
    expect(JSON.stringify(result.body)).not.toMatch(/read-only/i);
  });

  it('is a 503 with a retry hint for a read too, and any other fault stays a 500', () => {
    expect(answer('GET', new Error('Connection terminated unexpectedly')).status).toBe(503);
    expect(answer('POST', new Error('something else')).status).toBe(500);
  });
});
