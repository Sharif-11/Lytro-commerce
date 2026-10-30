import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import { headerValue, type HttpRequest } from '../../../common/http';
import { ShopperAccounts } from '../../shoppers/services/shopper-accounts';
import type { SignedInShopper } from '../../shoppers/types/shoppers';
import type { ApiShop } from '../types/public-api';
import { RequestLimits } from './request-limits';
import { secondsOf } from './visitor-limit';

// RTE-06: a visitor's sign-up code requests a minute to one shop.
export const CODES_PER_VISITOR_PER_MINUTE = 5;
// CUS-03: a visitor's sign-up and sign-in attempts a minute to one shop, on top of each account's own lock.
export const SIGNINS_PER_VISITOR_PER_MINUTE = 10;

/**
 * CUS-03, CUS-05, RTE-06 (Slice 4.4b): who a shopper route acts for -- the token the shop's site sends as
 * X-Shopper-Token, signed in to the key's own shop -- and the per-visitor windows on codes and sign-ins.
 */
@Injectable()
export class ShopperGate {
  constructor(
    @Inject(ShopperAccounts) private readonly accounts: ShopperAccounts,
    @Inject(RequestLimits) private readonly limits: RequestLimits,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  /** The signed-in shopper, or `unauthenticated` with no token, an unknown one or one of another shop. */
  async signedIn(shop: ApiShop, request: HttpRequest): Promise<SignedInShopper> {
    const token = headerValue(request.headers['x-shopper-token']);
    const signedIn = token ? await this.accounts.authenticate(shop.row.id, token) : null;
    if (!signedIn) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    return signedIn;
  }

  admitCode(shop: ApiShop, request: HttpRequest, now: Date): void {
    const verdict = this.limits.codesPerVisitor(
      shop.row.id,
      this.clientIp.resolve(request) ?? 'unknown',
      CODES_PER_VISITOR_PER_MINUTE,
      now,
    );
    if (!verdict.allowed) {
      throw new ApiError('rate_limited', 'TooManyCodesRequested', {}, secondsOf(verdict.resetMs));
    }
  }

  admitSignin(shop: ApiShop, request: HttpRequest, now: Date): void {
    const verdict = this.limits.signinsPerVisitor(
      shop.row.id,
      this.clientIp.resolve(request) ?? 'unknown',
      SIGNINS_PER_VISITOR_PER_MINUTE,
      now,
    );
    if (!verdict.allowed) {
      throw new ApiError('rate_limited', 'TooManyRequests', {}, secondsOf(verdict.resetMs));
    }
  }
}
