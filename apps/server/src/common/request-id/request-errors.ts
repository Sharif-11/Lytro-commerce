import { Inject, Injectable, Logger } from '@nestjs/common';
import { REQUEST_ERROR_KEEP_DAYS } from '@lytronix/validators';
import type { RequestErrorStore } from './ports/request-error-store';
import { REQUEST_ERROR_STORE } from './tokens';

const DAY_MS = 24 * 60 * 60 * 1000;
const ROUTE_LENGTH = 200;
const KIND_LENGTH = 120;
// The database's own five-character code (SQLSTATE), such as 23505 for a duplicate: it says what went wrong without
// any of the values involved.
const SQLSTATE = /^[0-9A-Z]{5}$/;

/** What the filter knows of a failed request. Kept loose so this file does not depend on Express types. */
export interface FaultedRequest {
  method?: string;
  route?: { path?: unknown };
  requestId?: string;
  /** Set by TenantGuard, DashboardGuard or the public key's guard. */
  tenant?: { id: string } | null;
  session?: { tenantId?: string | null };
}

/**
 * API-27, D8-3, D8-21 to D8-23 (Phase 8 Slice 8.1, read agreed 2026-11-07): keeps each server fault a shop's request
 * hit, for 7 days, for the operator's shop page (ADM-03). Server faults only: a 500, or a 503 when something Lytro
 * depends on is down, never a refusal. A request with no shop yet (signing in, the public API before its key) isn't
 * kept; its log line still has its ID. Kept on its own, after the response is decided, so a failure to keep it never
 * changes what the seller is told.
 */
@Injectable()
export class RequestErrors {
  private readonly logger = new Logger(RequestErrors.name);

  constructor(@Inject(REQUEST_ERROR_STORE) private readonly store: RequestErrorStore) {}

  /** An unexpected fault (500). */
  fault(request: FaultedRequest, exception: unknown): void {
    this.keep(request, 500, this.kindOf(exception));
  }

  /** A refusal because something Lytro depends on is down (503), by its message key. */
  unavailable(request: FaultedRequest, messageKey: string): void {
    this.keep(request, 503, messageKey);
  }

  /** D8-3: clears faults past the days they are kept. Safe to run twice. */
  purge(now: Date): Promise<number> {
    return this.store.purgeBefore(new Date(now.getTime() - REQUEST_ERROR_KEEP_DAYS * DAY_MS));
  }

  private keep(request: FaultedRequest, status: 500 | 503, kind: string): void {
    const tenantId = request.tenant?.id ?? request.session?.tenantId ?? null;
    const requestId = request.requestId;
    if (tenantId === null || requestId === undefined) return;
    const path = request.route?.path;
    this.store
      .record({
        tenantId,
        requestId,
        method: (request.method ?? 'GET').slice(0, 10),
        route: typeof path === 'string' ? path.slice(0, ROUTE_LENGTH) : null,
        status,
        kind: kind.slice(0, KIND_LENGTH),
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `a server fault couldn't be kept for its shop: ${error instanceof Error ? error.name : 'unknown'}`,
        );
      });
  }

  /** D8-23: the fault's class, with the database's code when it has one; never its message. */
  private kindOf(exception: unknown): string {
    if (!(exception instanceof Error)) return typeof exception;
    const code = this.sqlState(exception) ?? this.sqlState(exception.cause);
    const name = exception.constructor.name || exception.name;
    return code === undefined ? name : `${name} ${code}`;
  }

  private sqlState(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
    const { code } = error;
    return typeof code === 'string' && SQLSTATE.test(code) ? code : undefined;
  }
}
