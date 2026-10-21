import { Inject, Injectable } from '@nestjs/common';
import { shopLimitsOf, type PlanLimits } from '@lytronix/validators';
import type { AddonsStore } from '../ports/addons-store';
import { ADDONS_STORE } from '../tokens';
import { PlanLimitOverridesService } from './plan-limit-overrides.service';

/**
 * PLN-11, PLN-13: a plan's limits as one shop holds them -- its overrides laid over them and its active limit add-ons
 * on top, through `shopLimitsOf`, the one composition every reader of a shop's limits uses.
 */
@Injectable()
export class ShopLimitsService {
  constructor(
    @Inject(PlanLimitOverridesService) private readonly overrides: PlanLimitOverridesService,
    @Inject(ADDONS_STORE) private readonly addons: AddonsStore,
  ) {}

  async of(tenantId: string, limits: PlanLimits | null): Promise<PlanLimits | null> {
    const [overrides, addons] = await Promise.all([
      this.overrides.listForTenant(tenantId),
      this.addons.run((tx) => this.addons.activeUnits(tx, tenantId)),
    ]);
    return shopLimitsOf(limits, overrides, addons);
  }
}
