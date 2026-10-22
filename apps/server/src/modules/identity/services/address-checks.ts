import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../../common/api-error';
import { SlidingWindow } from '../../../common/sliding-window';
import { MINUTE_MS } from '../../../common/time';
import { SlugService } from '../../tenancy/services/slug.service';
import type { AddressCheckView } from '../types/address-check-view';

// AUTH-11: the create-shop screen asks as the owner types, pausing between keystrokes; this many a minute is far past
// typing, and far short of walking through every address.
const CHECKS_PER_MINUTE = 60;

/**
 * AUTH-11, TEN-26: the create-shop step's live verdict on an address -- free, or not (taken and reserved answer alike,
 * so the check tells nothing about who holds what) with the next free suggestion, or not an address at all. Held to a
 * number a minute per account. Creating the shop checks again; the database's unique index has the last word.
 */
@Injectable()
export class AddressChecks {
  private readonly window = new SlidingWindow(MINUTE_MS);

  constructor(@Inject(SlugService) private readonly slugs: SlugService) {}

  async check(subscriberId: string, address: string, now = Date.now()): Promise<AddressCheckView> {
    this.window.sweep(now);
    const verdict = this.window.take(subscriberId, CHECKS_PER_MINUTE, now);
    if (!verdict.allowed) {
      throw new ApiError('rate_limited', 'TooManyRequests', {}, Math.ceil(verdict.resetMs / 1000));
    }
    const result = await this.slugs.checkAddress(address);
    return result.ok
      ? { available: true, address: result.address, reason: null, suggestion: null }
      : { available: false, address: null, reason: result.reason, suggestion: result.suggestion };
  }
}
