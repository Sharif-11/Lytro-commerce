import { ApiError } from '../../../common/api-error';
import { CircuitBreaker } from '../../../common/circuit-breaker';

/** Google or Facebook, as the circuits and the "not answering" message name them. */
export type OauthService = 'google' | 'facebook';

/** A provider's own side failing: a 5xx, which counts toward its circuit as a lost connection does. */
class ProviderFailed extends Error {
  constructor(service: OauthService, status: number) {
    super(`${service} answered ${String(status)}`);
    this.name = 'ProviderFailed';
  }
}

// How soon to try again, once the provider has stopped answering: its circuit's minute.
const TRY_AGAIN_SECONDS = 60;

/**
 * PRF-05 (Phase 9 Slice 9.5): every call a Google or Facebook sign-in makes, through that provider's circuit. Its 4xx
 * is an answer about this sign-in (a code already used), read by the caller as before; a lost connection, a 5xx or an
 * open circuit is the provider being away, refused with "try again, or sign in with your phone number".
 */
export class OauthCalls {
  constructor(
    private readonly service: OauthService,
    private readonly breaker: CircuitBreaker = new CircuitBreaker({ service }),
    private readonly fetcher: (url: string | URL, init?: RequestInit) => Promise<Response> = (
      url,
      init,
    ) => fetch(url, init),
  ) {}

  async send(url: string | URL, init?: RequestInit): Promise<Response> {
    try {
      return await this.breaker.call(this.service, async () => {
        const response = await this.fetcher(url, init);
        if (response.status >= 500) throw new ProviderFailed(this.service, response.status);
        return response;
      });
    } catch {
      throw new ApiError(
        'service_unavailable',
        'SignInProviderNotAnswering',
        { provider: this.service },
        TRY_AGAIN_SECONDS,
        { provider: this.service },
      );
    }
  }
}
