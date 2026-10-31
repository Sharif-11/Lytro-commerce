import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../../common/api-error';
import type { HttpResponse } from '../../../common/http';
import { PaymentSessions } from '../../payment-sessions/services/payment-sessions';
import { CLOSED_STATES } from '../../tenancy/services/tenant-resolver.service';
import { ApiKeyAuthenticator } from '../services/api-key-authenticator';
import { VisitorLimit } from '../services/visitor-limit';
import { API_CLOCK } from '../tokens';
import type { PublicApiRequest } from './public-key.guard';

// PAY-23: a reference is 22 URL-safe characters; anything else is not one.
const REF = /^[A-Za-z0-9_-]{22}$/;

interface PageRequest extends PublicApiRequest {
  params: Record<string, string | undefined>;
}

/**
 * PAY-03, PAY-23, TEN-29, RTE-06 (Phase 5 Slice 5.2): the gate of the payment page's routes. The page sends no key; the
 * session's reference in the address stands for it and names the shop, never the host. An unknown reference, or a shop
 * closed or suspended, is not found, alike; a shop whose payment page Lytro suspended shows it unavailable (TVR-03,
 * Slice 5.2b), within the shop lookup's few seconds. Then the visitor's requests in the last minute. The page is Lytro's
 * own, so its requests are not counted against the shop's API requests.
 */
@Injectable()
export class PaymentPageGuard implements CanActivate {
  constructor(
    @Inject(PaymentSessions) private readonly sessions: PaymentSessions,
    @Inject(ApiKeyAuthenticator) private readonly authenticator: ApiKeyAuthenticator,
    @Inject(VisitorLimit) private readonly visitors: VisitorLimit,
    @Inject(API_CLOCK) private readonly clock: () => Date,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PageRequest>();
    const response = context.switchToHttp().getResponse<HttpResponse>();
    const ref = request.params['ref'] ?? '';
    const tenantId = REF.test(ref) ? await this.sessions.tenantOfRef(ref) : null;
    const shop = tenantId === null ? null : await this.authenticator.shopOf(tenantId);
    if (!shop || CLOSED_STATES.has(shop.row.state) || shop.row.suspendedAt !== null) {
      throw new ApiError('not_found', 'PaymentNotFound', {});
    }
    if (shop.row.paymentPageSuspendedAt !== null) {
      throw new ApiError('tenant_offline', 'PaymentPageUnavailable', {});
    }
    await this.visitors.admit(shop, request, response, this.clock());
    request.apiShop = shop;
    return true;
  }
}
