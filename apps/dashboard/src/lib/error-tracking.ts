import * as Sentry from '@sentry/browser';
import { redactText } from '@lytronix/shared-types';
import { shopOfPath } from '../session/shop-of-path';
import { type AppConfig, appConfig } from './app-config';

/** OBS-03: at most this many errors sent from one page load, so one broken screen can't use up the month's allowance. */
const PER_PAGE_LOAD = 10;

/**
 * OBS-03 (Slice 9.6): the dashboard's errors to Sentry, when its build names a Sentry address: whatever the page didn't
 * catch, and what a screen's error boundary caught, with the release, the server it ran on and the shop it was for.
 * What it says passes the server's own redaction list (LOG-02); the page's address goes without its query, and no
 * request, cookie or person is sent. The API's faults are the server's to report, under their request IDs. Without an
 * address, nothing is sent and Sentry never starts.
 */
export class ErrorTracking {
  private started = false;
  private sent = 0;

  constructor(
    private readonly config: Pick<AppConfig, 'sentryDsn' | 'release' | 'environment'>,
    private readonly pathname: () => string = () => window.location.pathname,
    private readonly transport?: Sentry.BrowserOptions['transport'],
  ) {}

  start(): void {
    const dsn = this.config.sentryDsn;
    if (dsn === null || this.started) return;
    Sentry.init({
      dsn,
      release: this.config.release,
      environment: this.config.environment,
      // Errors only: no tracing, no replays, no breadcrumbs of clicks or calls.
      defaultIntegrations: false,
      integrations: [
        Sentry.globalHandlersIntegration(),
        Sentry.linkedErrorsIntegration(),
        Sentry.dedupeIntegration(),
      ],
      maxBreadcrumbs: 0,
      beforeSend: (event) => this.prepare(event),
      ...(this.transport ? { transport: this.transport } : {}),
    });
    this.started = true;
  }

  /** An error a screen caught (React's onCaughtError); one nobody caught is reported by itself. */
  capture(error: unknown): void {
    if (this.started) Sentry.captureException(error);
  }

  private prepare(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
    if (this.sent >= PER_PAGE_LOAD) return null;
    this.sent += 1;
    if (event.message) event.message = redactText(event.message);
    for (const exception of event.exception?.values ?? []) {
      if (exception.value) exception.value = redactText(exception.value);
    }
    const shop = shopOfPath(this.pathname());
    if (shop !== null) event.tags = { ...event.tags, shop };
    const url = event.request?.url;
    event.request = url ? { url: redactText(url.split('?')[0] ?? url) } : undefined;
    delete event.user;
    return event;
  }
}

export const errorTracking = new ErrorTracking(appConfig);
