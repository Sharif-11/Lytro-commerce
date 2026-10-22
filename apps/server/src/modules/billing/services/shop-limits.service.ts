import { Inject, Injectable } from '@nestjs/common';
import { shopLimitsOf, withOverrides, type PlanLimits } from '@lytronix/validators';
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

  /**
   * PLN-11: a plan's limits with the shop's overrides, before any add-on -- what decides whether an add-on still has
   * a limit to raise on that plan (PLN-14, PLN-19).
   */
  async planOf(tenantId: string, limits: PlanLimits | null): Promise<PlanLimits | null> {
    return withOverrides(limits, await this.overrides.listForTenant(tenantId));
  }
}
