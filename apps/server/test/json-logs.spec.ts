import { EventEmitter } from 'node:events';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestContext } from '../src/common/request-id/request-context';
import { RequestIdHandler } from '../src/common/request-id/request-id-handler';
import { RequestIds } from '../src/common/request-id/request-ids';
import { type RequestLine, RequestLogger } from '../src/common/request-id/request-logger';
import { ShopLogContext } from '../src/common/request-id/shop-log-context';

// D9-20, LOG-01, LOG-02, PRF-04 (Slice 9.6): production's log lines as JSON with the request's and the shop's IDs and
// the message redacted, a request line per request, and the shop taken from whichever guard found it.
afterEach(() => {
  vi.restoreAllMocks();
});

function captured(stream: 'stdout' | 'stderr'): Record<string, unknown>[] {
  const lines: Record<string, unknown>[] = [];
  vi.spyOn(process[stream], 'write').mockImplementation((chunk: string | Uint8Array) => {
    lines.push(JSON.parse(String(chunk)) as Record<string, unknown>);
    return true;
  });
  return lines;
}

describe('JSON log lines (Slice 9.6)', () => {
  it("carry the time, level, role, the request's ID and its shop's, the message redacted", () => {
    const requests = new RequestContext();
    const logger = new RequestLogger(requests, { NODE_ENV: 'production', SERVER_ROLE: 'api' });
    const lines = captured('stdout');
    requests.run('K7MQ-4XR2', () => {
      requests.setShop('6f1c2b7e-1d2a-4c3b-9e8f-0a1b2c3d4e5f');
      logger.log('sms to 01712345678 with otp=482913 sent', 'Orders');
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 'log',
      role: 'api',
      context: 'Orders',
      requestId: 'K7MQ-4XR2',
      shopId: '6f1c2b7e-1d2a-4c3b-9e8f-0a1b2c3d4e5f',
      msg: 'sms to *******5678 with otp=[masked] sent',
    });
    expect(Number.isNaN(Date.parse(String(lines[0]?.['time'])))).toBe(false);
  });

  it("puts an error's stack on a line of its own to stderr, redacted, with the request's ID", () => {
    const requests = new RequestContext();
    const logger = new RequestLogger(requests, { LOG_FORMAT: 'json' });
    const errors = captured('stderr');
    requests.run('AB12-CD34', () => {
      logger.error(
        'payment failed',
        'Error: refused for 01812345678\n    at pay (pay.ts:1:1)',
        'Payments',
      );
    });
    expect(errors.map((line) => line['msg'])).toEqual(['payment failed', 'stack']);
    expect(errors[1]).toMatchObject({ requestId: 'AB12-CD34', level: 'error' });
    expect(String(errors[1]?.['stack'])).toContain('refused for *******5678');
  });

  it('stays text outside production, the ID after the context, still redacted', () => {
    const requests = new RequestContext();
    const logger = new RequestLogger(requests, { NODE_ENV: 'development' });
    const written: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    });
    requests.run('K7MQ-4XR2', () => {
      logger.log('sms to 01712345678', 'Orders');
    });
    expect(written.join('')).toContain('[K7MQ-4XR2] ');
    expect(written.join('')).toContain('sms to *******5678');
    expect(() => {
      JSON.parse(written[0] ?? '');
    }).toThrow();
  });
});

describe('the request line (PRF-04)', () => {
  function handled(path: string, route?: string) {
    const requests = new RequestContext();
    const lines: RequestLine[] = [];
    const handler = new RequestIdHandler(new RequestIds(), requests, {
      request: (line) => lines.push(line),
    });
    const response = Object.assign(new EventEmitter(), {
      statusCode: 201,
      setHeader: () => undefined,
    });
    const request = {
      method: 'POST',
      originalUrl: path,
      route: route ? { path: route } : undefined,
      apiShop: { row: { id: 'shop-1' } },
    };
    handler.handle(request, response, () => {
      requests.addOutside(120);
    });
    response.emit('finish');
    return lines;
  }

  it("tells a request's route pattern, status, time and outside time when it's sent", () => {
    const lines = handled('/api/v1/public/orders?phone=01712345678', '/api/v1/public/orders');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      method: 'POST',
      route: '/api/v1/public/orders',
      status: 201,
      outsideMs: 120,
      outsideCalls: 1,
      shopId: 'shop-1',
    });
    expect(lines[0]?.requestId).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  });

  it('names an unmatched path without its query, and skips the health checks', () => {
    expect(handled('/nowhere/01712345678?x=1')[0]?.route).toBe('/nowhere/*******5678');
    expect(handled('/health/ready', '/health/ready')).toEqual([]);
  });
});

describe('the shop in the log lines (LOG-01)', () => {
  function shopOf(request: object): string | undefined {
    const requests = new RequestContext();
    const interceptor = new ShopLogContext(requests);
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of(null) };
    return requests.run('K7MQ-4XR2', () => {
      void interceptor.intercept(context, next);
      return requests.shopId();
    });
  }

  it('takes the shop from whichever guard found it, and none from an account-level route', () => {
    expect(shopOf({ tenant: { id: 'shop-a' } })).toBe('shop-a');
    expect(shopOf({ apiShop: { row: { id: 'shop-b' } } })).toBe('shop-b');
    expect(shopOf({ tenant: null })).toBeUndefined();
  });
});
