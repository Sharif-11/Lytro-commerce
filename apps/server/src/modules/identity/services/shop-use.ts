import { Inject, Injectable } from '@nestjs/common';
import { LAPSED_TENANT_STATES } from '@lytronix/validators';
import { StaffService } from '../../staff/services/staff.service';
import { TenantSummaries } from '../../tenancy/services/tenant-summaries.service';
import type { SignupGateway } from '../ports/signup-gateway';
import { SIGNUP_GATEWAY } from '../tokens';

/**
 * AUTH-21, SMS-04 (Slice 7.1, read agreed 2026-11-06): which shop an SMS to a person comes out of, when it comes from the
 * shop's own use. The shop the person owns, or else the one they're staff of, and none while that shop has lapsed,
 * since its balance is frozen and the code is the platform letting its owner back in (LIF-10).
 */
@Injectable()
export class ShopUse {
  constructor(
    @Inject(SIGNUP_GATEWAY)
    private readonly gateway: Pick<SignupGateway, 'run' | 'findOwnedTenant'>,
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(TenantSummaries) private readonly summaries: TenantSummaries,
  ) {}

  /** `owner: false` leaves the owner out: their own password reset stays Lytro's cost. */
  async shopOf(subscriberId: string, options: { owner: boolean }): Promise<string | null> {
    if (options.owner) {
      const owned = await this.gateway.run((tx) => this.gateway.findOwnedTenant(tx, subscriberId));
      if (owned) return LAPSED_TENANT_STATES.includes(owned.state) ? null : owned.id;
    }
    const staffShop = await this.staff.staffShopOf(subscriberId);
    if (!staffShop?.active) return null;
    const shop = await this.summaries.findById(staffShop.tenantId);
    return shop && !LAPSED_TENANT_STATES.includes(shop.state) ? shop.id : null;
  }
}
