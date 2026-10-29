import { Inject, Injectable } from '@nestjs/common';
import { PlatformSettingKey } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import type { HttpRequest, HttpResponse } from '../../../common/http';
import { SECOND_MS } from '../../../common/time';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import type { ApiShop } from '../types/public-api';
import { RequestLimits } from './request-limits';
import { RequestQuota } from './request-quota';

// RTE-06: a visitor's requests a minute to one shop when the operator has set no figure of their own.
export const DEFAULT_REQUESTS_PER_VISITOR_PER_MINUTE = 120;

/** Whole seconds until a window frees a place, at least one, as Retry-After and X-RateLimit-Reset say it. */
export function secondsOf(ms: number): number {
  return Math.max(Math.ceil(ms / SECOND_MS), 1);
}

/**
 * RTE-02, RTE-06, KNOWN-GAPS §82: the per-minute limit of a public API request, held per visitor and shop, never per
 * key: every shopper's request carries the shop's one key, and a busy hour must not refuse them all. The figure is the
 * operator's platform setting. Every answer says where the visitor stands in its minute; a refusal says when to try
 * again, and is counted with its visitor, so the operator can see whether real shoppers sharing one address meet it.
 */
@Injectable()
export class VisitorLimit {
  constructor(
    @Inject(RequestLimits) private readonly limits: RequestLimits,
    @Inject(RequestQuota) private readonly quota: RequestQuota,
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  /** Lets the visitor's request through, or refuses it with 429 once its minute is used up. */
  async admit(
    shop: ApiShop,
    request: HttpRequest,
    response: HttpResponse,
    now: Date,
  ): Promise<void> {
    const limit = await this.perMinute();
    const visitor = this.clientIp.resolve(request) ?? 'unknown';
    const verdict = this.limits.perVisitor(shop.row.id, visitor, limit, now);
    response.setHeader('X-RateLimit-Limit', String(limit));
    response.setHeader('X-RateLimit-Remaining', String(verdict.remaining));
    response.setHeader('X-RateLimit-Reset', String(secondsOf(verdict.resetMs)));
    if (!verdict.allowed) {
      this.quota.refused(shop, visitor, now);
      throw new ApiError('rate_limited', 'TooManyRequests', {}, secondsOf(verdict.resetMs));
    }
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
