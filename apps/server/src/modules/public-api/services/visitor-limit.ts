import { Inject, Injectable } from '@nestjs/common';
import { PlatformSettingKey } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import type { HttpRequest, HttpResponse } from '../../../common/http';
import type { WindowVerdict } from '../../../common/sliding-window';
import { StorefrontShopper } from '../../../common/storefront-shopper';
import { SECOND_MS } from '../../../common/time';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import type { ApiShop } from '../types/public-api';
import { RequestLimits } from './request-limits';
import { RequestQuota } from './request-quota';

// RTE-06: a visitor's requests a minute to one shop when the operator has set no figure of their own.
export const DEFAULT_REQUESTS_PER_VISITOR_PER_MINUTE = 120;
// RTE-06 as amended (load fix 2, the owner, 2026-11-20): the storefront's shoppers behind one address may together make
// ten shoppers' worth of the per-visitor figure a minute -- 1,200 at the default 120 -- the backstop against a shopper
// who drops their mark.
export const STOREFRONT_SHOPPERS_PER_ADDRESS = 10;

/** Whole seconds until a window frees a place, at least one, as Retry-After and X-RateLimit-Reset say it. */
export function secondsOf(ms: number): number {
  return Math.max(Math.ceil(ms / SECOND_MS), 1);
}

/** A window's answer, and who a refusal is counted against. */
interface Admission {
  verdict: WindowVerdict;
  visitor: string;
}

/**
 * RTE-02, RTE-06, KNOWN-GAPS §82: the per-minute limit of a public API request, held per visitor and shop, never per
 * key: every shopper's request carries the shop's one key, and a busy hour must not refuse them all. The figure is the
 * operator's platform setting. Every answer says where the visitor stands in its minute; a refusal says when to try
 * again, and is counted with its visitor, so the operator can see whether real shoppers sharing one address meet it.
 *
 * RTE-06 as amended (load fix 2): a visitor is a shopper when the storefront's own server vouches for them
 * (StorefrontShopper), since phones behind one mobile network's address share it. The shopper is then held to the
 * figure alone, and their address to the backstop beside it; any other request (a shop's own website's) is held by its
 * address, as before.
 */
@Injectable()
export class VisitorLimit {
  constructor(
    @Inject(RequestLimits) private readonly limits: RequestLimits,
    @Inject(RequestQuota) private readonly quota: RequestQuota,
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
    @Inject(StorefrontShopper) private readonly shoppers: StorefrontShopper,
  ) {}

  /** Lets the visitor's request through, or refuses it with 429 once its minute is used up. */
  async admit(
    shop: ApiShop,
    request: HttpRequest,
    response: HttpResponse,
    now: Date,
  ): Promise<void> {
    const limit = await this.perMinute();
    const address = this.clientIp.resolve(request) ?? 'unknown';
    const shopper = this.shoppers.of(request);
    const { verdict, visitor } =
      shopper === null
        ? {
            verdict: await this.limits.perVisitor(shop.row.id, address, limit, now),
            visitor: address,
          }
        : await this.storefront(shop.row.id, shopper, address, limit, now);
    response.setHeader('X-RateLimit-Limit', String(limit));
    response.setHeader('X-RateLimit-Remaining', String(verdict.remaining));
    response.setHeader('X-RateLimit-Reset', String(secondsOf(verdict.resetMs)));
    if (!verdict.allowed) {
      this.quota.refused(shop, visitor, now);
      throw new ApiError('rate_limited', 'TooManyRequests', {}, secondsOf(verdict.resetMs));
    }
  }

  /**
   * The storefront's shopper: their own minute first (a refused request isn't counted against the address), then the
   * address's backstop. The answer's figures are the shopper's own, unless the backstop refuses.
   */
  private async storefront(
    tenantId: string,
    shopper: string,
    address: string,
    limit: number,
    now: Date,
  ): Promise<Admission> {
    const own = await this.limits.perShopper(tenantId, shopper, limit, now);
    if (!own.allowed) return { verdict: own, visitor: `shopper:${shopper}` };
    const together = await this.limits.perStorefrontAddress(
      tenantId,
      address,
      limit * STOREFRONT_SHOPPERS_PER_ADDRESS,
      now,
    );
    return together.allowed
      ? { verdict: own, visitor: address }
      : { verdict: { ...together, remaining: 0 }, visitor: address };
  }

  private async perMinute(): Promise<number> {
    const setting = await this.settings.current(
      PlatformSettingKey.PublicRequestsPerVisitorPerMinute,
    );
    return typeof setting?.value === 'number'
      ? setting.value
      : DEFAULT_REQUESTS_PER_VISITOR_PER_MINUTE;
  }
}
