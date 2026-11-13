import { Inject, Injectable, Optional, type OnApplicationShutdown } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import type { Env } from '../../config/env';
import { ENV } from '../../config/tokens';
import { redactText, redactValue } from '@lytronix/shared-types';

/** What a reported error is tagged with, so it's found from a seller's ID or a shop's page. */
export interface ErrorScope {
  requestId?: string;
  tenantId?: string | null;
  /** The route's pattern (`/orders/:id`), never its values. */
  route?: string;
  /** The queue whose job failed. */
  job?: string;
}

/** OBS-03: at most this many reports of one error (its kind and message) an hour from one process. */
const PER_ERROR_PER_HOUR = 10;
const HOUR_MS = 60 * 60_000;

/** Where events go: Sentry's own sender, or a spec's. */
export const ERROR_TRACKER_TRANSPORT = Symbol('ERROR_TRACKER_TRANSPORT');

type TrackerSettings = Partial<Pick<Env, 'SENTRY_DSN' | 'SENTRY_ENVIRONMENT' | 'RELEASE'>> &
  Pick<Env, 'SERVER_ROLE'>;

/**
 * OBS-03 (Slice 9.6): the server's errors to Sentry, when SENTRY_DSN is set: each unexpected fault a request hit, each
 * job that failed, and anything the process didn't catch, with the release, the request's ID and the shop's ID.
 * What it says passes the redaction list first (LOG-02); no request body, header or cookie is ever sent. One noisy
 * error is sent at most 10 times an hour from a process, so it can't use up the month's allowance; Sentry groups and
 * alerts on a new kind or a spike. Without SENTRY_DSN, nothing is sent and nothing is loaded.
 */
@Injectable()
export class ErrorTracker implements OnApplicationShutdown {
  private readonly enabled: boolean;
  private readonly recent = new Map<string, { since: number; count: number }>();

  constructor(
    @Inject(ENV) env: TrackerSettings,
    @Optional() @Inject(ERROR_TRACKER_TRANSPORT) transport?: Sentry.NodeOptions['transport'],
  ) {
    this.enabled = env.SENTRY_DSN !== undefined;
    if (!this.enabled) return;
    Sentry.init({
      dsn: env.SENTRY_DSN,
      release: env.RELEASE,
      environment: env.SENTRY_ENVIRONMENT,
      // Errors only: no tracing, no request data, no breadcrumbs from the console.
      defaultIntegrations: false,
      integrations: [
        Sentry.onUncaughtExceptionIntegration(),
        Sentry.onUnhandledRejectionIntegration(),
        Sentry.linkedErrorsIntegration(),
        Sentry.dedupeIntegration(),
      ],
      maxBreadcrumbs: 0,
      initialScope: { tags: { role: env.SERVER_ROLE } },
      beforeSend: (event) => this.redact(event),
      ...(transport ? { transport } : {}),
    });
  }

  /** Reports an error with its request, shop, route or job. Never throws. */
  capture(error: unknown, scope: ErrorScope): void {
    if (!this.enabled || !this.allowed(error)) return;
    Sentry.withScope((sentryScope) => {
      if (scope.requestId) sentryScope.setTag('request_id', scope.requestId);
      if (scope.tenantId) sentryScope.setTag('tenant_id', scope.tenantId);
      if (scope.route) sentryScope.setTag('route', scope.route);
      if (scope.job) sentryScope.setTag('job', scope.job);
      Sentry.captureException(error);
    });
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.enabled) await Sentry.close(2_000);
  }

  /** OBS-03's rate limit, per process: the same kind and message at most 10 times in an hour. */
  private allowed(error: unknown): boolean {
    const key =
      error instanceof Error
        ? `${error.name}:${error.message.slice(0, 200)}`
        : String(error).slice(0, 200);
    const now = Date.now();
    const seen = this.recent.get(key);
    if (seen === undefined || now - seen.since >= HOUR_MS) {
      if (this.recent.size > 1_000) this.recent.clear();
      this.recent.set(key, { since: now, count: 1 });
      return true;
    }
    seen.count += 1;
    return seen.count <= PER_ERROR_PER_HOUR;
  }

  /**
   * LOG-02: the event's words pass the redaction list: its message, each exception's message and any extra data. Its
   * IDs, release and tags are left as they are, since they're how it's found.
   */
  private redact(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
    if (event.message) event.message = redactText(event.message);
    for (const exception of event.exception?.values ?? []) {
      if (exception.value) exception.value = redactText(exception.value);
    }
    if (event.extra) event.extra = redactValue(event.extra) as Record<string, unknown>;
    delete event.request;
    delete event.user;
    return event;
  }
}
