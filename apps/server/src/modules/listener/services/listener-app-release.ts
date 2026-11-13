import { Inject, Injectable, Logger } from '@nestjs/common';
import { listenerReleaseOf, type ListenerAppView } from '@lytronix/validators';
import type { Env } from '../../../config/env';
import { ENV } from '../../../config/tokens';
import { MINUTE_MS, SECOND_MS } from '../../../common/time';
import { LISTENER_CLOCK, LISTENER_RELEASE_FETCH } from '../tokens';

// A release is kept five minutes, as the website's page keeps it, so a new one shows within minutes without a deploy.
// No release is kept one minute: a host that failed once is asked again soon, and never on every page view.
const RELEASE_KEPT_MS = 5 * MINUTE_MS;
const NONE_KEPT_MS = MINUTE_MS;
// The downloads host is a bucket behind Cloudflare: a slow answer is no answer, and the button waits for none.
const ASK_TIMEOUT_MS = 5 * SECOND_MS;

/**
 * TENANT-DASHBOARD-DESIGN §7.44 (small fixes, 2026-11-13): the listener app's current release, read from latest.json on
 * its downloads host (LISTENER_DOWNLOAD_URL) and checked as the website checks it (`listenerReleaseOf`), for the
 * dashboard's download button, its version and size, and the QR. The dashboard is one build for every environment, so
 * the server says where the file is. Null when there's no release to offer; the dashboard then shows no button.
 */
@Injectable()
export class ListenerAppRelease {
  private readonly log = new Logger(ListenerAppRelease.name);
  private readonly base: string;
  private kept: { until: number; view: ListenerAppView | null } | undefined;
  // One read at a time: requests that arrive while the host is asked share its answer.
  private asking: Promise<ListenerAppView | null> | undefined;

  constructor(
    @Inject(ENV) env: Pick<Env, 'LISTENER_DOWNLOAD_URL'>,
    @Inject(LISTENER_RELEASE_FETCH) private readonly send: typeof fetch,
    @Inject(LISTENER_CLOCK) private readonly now: () => Date,
  ) {
    this.base = env.LISTENER_DOWNLOAD_URL.replace(/\/+$/, '');
  }

  async current(): Promise<ListenerAppView | null> {
    if (this.kept && this.now().getTime() < this.kept.until) return this.kept.view;
    this.asking ??= this.ask().finally(() => {
      this.asking = undefined;
    });
    return this.asking;
  }

  private async ask(): Promise<ListenerAppView | null> {
    const view = await this.read();
    this.kept = {
      until: this.now().getTime() + (view ? RELEASE_KEPT_MS : NONE_KEPT_MS),
      view,
    };
    return view;
  }

  private async read(): Promise<ListenerAppView | null> {
    try {
      const response = await this.send(`${this.base}/latest.json`, {
        signal: AbortSignal.timeout(ASK_TIMEOUT_MS),
      });
      if (!response.ok) {
        // No release uploaded yet is a 404: nothing to tell.
        if (response.status !== 404) {
          this.log.warn(`the listener's latest.json answered ${String(response.status)}`);
        }
        return null;
      }
      const release = listenerReleaseOf(await response.json(), this.base);
      if (!release) {
        this.log.warn("the listener's latest.json doesn't read as a release");
        return null;
      }
      return { version: release.version, url: release.url, bytes: release.bytes };
    } catch (error) {
      this.log.warn(`could not read the listener's latest.json: ${String(error)}`);
      return null;
    }
  }
}
