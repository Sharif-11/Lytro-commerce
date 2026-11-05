import { Inject, Injectable } from '@nestjs/common';
import type { CourierKey } from '@lytronix/validators';
import type { CourierAdapter } from '../ports/courier-adapter';
import { SteadfastAdapter } from './steadfast-adapter';

/**
 * CRR-01, §3.6 (Phase 6 Slice 6.1): the couriers there are, by key, as gateways are registered. Adding one is one more entry here and
 * the adapter itself, changing no booking or order code.
 */
@Injectable()
export class CourierRegistry {
  private readonly byKey: ReadonlyMap<CourierKey, CourierAdapter>;

  constructor(@Inject(SteadfastAdapter) steadfast: SteadfastAdapter) {
    this.byKey = new Map<CourierKey, CourierAdapter>([[steadfast.key, steadfast]]);
  }

  all(): CourierAdapter[] {
    return [...this.byKey.values()];
  }

  of(key: CourierKey): CourierAdapter | undefined {
    return this.byKey.get(key);
  }
}
