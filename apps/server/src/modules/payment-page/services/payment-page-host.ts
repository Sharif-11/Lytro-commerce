import { Inject, Injectable } from '@nestjs/common';
import { headerValue, type HttpRequest } from '../../../common/http';
import { HostClassifier } from '../../tenancy/services/host-classifier';

// What a shopper's address on the page's host may name: its assets, a session's page, or one of that page's actions.
const ASSET = /^\/assets\/([\w./-]+)$/;
const PAGE = /^\/([\w-]+)(\/(?:status|transaction|change|checkout|report))?$/;
// Not a reference, so the page's guard answers it as a page that wasn't found.
const NO_SUCH_PAGE = '/api/v1/pay-page/-';

interface RawRequest extends HttpRequest {
  url: string;
  /** Set when the request came in on the payment page's own host. */
  paymentPageHost?: boolean;
}

/**
 * PAY-01, PAY-23 (Slice 5.8's part 2): the payment page's own host, `pay.<platform domain>`. Every address on it becomes one
 * of the page's own routes, or a page that wasn't found, so nothing else on the server can be reached from this host.
 */
@Injectable()
export class PaymentPageHost {
  constructor(@Inject(HostClassifier) private readonly hosts: HostClassifier) {}

  /** As Express middleware, ahead of every route. */
  readonly handle = (request: RawRequest, _response: unknown, next: () => void): void => {
    if (this.hosts.isPaymentPage(headerValue(request.headers.host))) {
      request.paymentPageHost = true;
      request.url = this.routeOf(request.url);
    }
    next();
  };

  private routeOf(url: string): string {
    const at = url.indexOf('?');
    const path = at === -1 ? url : url.slice(0, at);
    const query = at === -1 ? '' : url.slice(at);
    const asset = ASSET.exec(path);
    if (asset) return `/api/v1/pay-assets/${encodeURIComponent(asset[1] ?? '')}${query}`;
    return PAGE.test(path) ? `/api/v1/pay-page${path}${query}` : `${NO_SUCH_PAGE}${query}`;
  }
}
