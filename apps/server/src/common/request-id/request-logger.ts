import { ConsoleLogger, Inject, Injectable, type LogLevel, Optional } from '@nestjs/common';
import { redactText, redactValue } from '@lytronix/shared-types';
import type { Env } from '../../config/env';
import { ENV } from '../../config/tokens';
import { RequestContext } from './request-context';

/** One request as its request line tells it (Slice 9.6, PRF-04). */
export interface RequestLine {
  requestId: string;
  shopId?: string;
  method: string;
  /** The route's pattern (`/api/v1/orders/:id`), or, for a request no route matched, its path without the query. */
  route: string;
  status: number;
  ms: number;
  /** PRF-04 (Slice 9.5): the time it spent waiting on outside services, and how many calls. */
  outsideMs: number;
  outsideCalls: number;
}

type LoggerSettings = Partial<Pick<Env, 'LOG_FORMAT' | 'NODE_ENV' | 'SERVER_ROLE'>>;

/**
 * API-27 (Phase 8 Slice 8.1): the server's logger, Nest's own, with the request's ID on every line written while a
 * request runs, so the line a seller's ID points to is found by searching for it.
 *
 * D9-20, LOG-01, LOG-02 (Slice 9.6): in production each line is one JSON object, with the time, level, role, the
 * request's ID and its shop's, and the message passed through the redaction list; a request line closes each request.
 * The journal keeps them 14 days (setup-server.sh). Elsewhere (LOG_FORMAT=text, the default outside production) the
 * lines stay Nest's readable text, the ID after the context ("[ApiErrorFilter] [K7MQ-4XR2] ..."), still redacted.
 */
@Injectable()
export class RequestLogger extends ConsoleLogger {
  private readonly json: boolean;
  private readonly role: string | undefined;

  constructor(
    @Inject(RequestContext) private readonly requests: RequestContext,
    @Optional() @Inject(ENV) env?: LoggerSettings,
  ) {
    super();
    this.json = (env?.LOG_FORMAT ?? (env?.NODE_ENV === 'production' ? 'json' : 'text')) === 'json';
    this.role = env?.SERVER_ROLE;
  }

  /** PRF-04: one line per request, as it finished. */
  request(line: RequestLine): void {
    if (this.json) {
      this.write('stdout', { level: 'log', context: 'Request', msg: 'request', ...line });
      return;
    }
    const shop = line.shopId ? ` shop=${line.shopId}` : '';
    super.printMessages(
      [
        `[${line.requestId}] ${line.method} ${line.route} ${String(line.status)} ${String(line.ms)}ms outside=${String(line.outsideMs)}ms/${String(line.outsideCalls)}${shop}`,
      ],
      'Request',
      'log',
      'stdout',
    );
  }

  protected override formatContext(context: string): string {
    const requestId = this.requests.requestId();
    const formatted = super.formatContext(context);
    return requestId === undefined ? formatted : `${formatted}[${requestId}] `;
  }

  protected override printMessages(
    messages: unknown[],
    context = '',
    logLevel: LogLevel = 'log',
    writeStreamType?: 'stdout' | 'stderr',
  ): void {
    if (!this.json) {
      super.printMessages(
        messages.map((message) =>
          typeof message === 'string' ? redactText(message) : redactValue(message),
        ),
        context,
        logLevel,
        writeStreamType,
      );
      return;
    }
    for (const message of messages) {
      const said =
        typeof message === 'string'
          ? { msg: redactText(message) }
          : { msg: '', data: redactValue(message) };
      this.write(writeStreamType ?? 'stdout', { level: logLevel, context, ...said });
    }
  }

  protected override printStackTrace(stack: string): void {
    if (!stack) return;
    if (!this.json) {
      super.printStackTrace(redactText(stack));
      return;
    }
    this.write('stderr', { level: 'error', msg: 'stack', stack: redactText(stack) });
  }

  private write(stream: 'stdout' | 'stderr', fields: Record<string, unknown>): void {
    const line = {
      time: new Date().toISOString(),
      role: this.role,
      requestId: this.requests.requestId(),
      shopId: this.requests.shopId(),
      ...fields,
    };
    process[stream].write(`${JSON.stringify(line)}\n`);
  }
}
