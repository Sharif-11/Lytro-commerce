import { Inject, Injectable } from '@nestjs/common';
import { catalogueIdSchema } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import type { MessageKey } from '../../../common/i18n/message-key';
import { PlanLimitOverridesService } from '../../billing/services/plan-limit-overrides.service';
import type { CatalogueActor, CatalogueShop, OperatorActor } from '../../catalogue/types/catalogue';
import type { DashboardRequest } from '../../identity/guards/dashboard.guard';
import type { OperatorSessionRequest } from '../../operator/guards/operator-session.guard';

/** What every catalogue route reads off its request: the shop (with its effective limits) and who is acting. */
@Injectable()
export class CatalogueRequest {
  constructor(
    @Inject(PlanLimitOverridesService) private readonly limitOverrides: PlanLimitOverridesService,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  tenantIdOf(request: DashboardRequest): string {
    const tenant = request.tenant;
    if (!tenant) throw new ApiError('forbidden', 'CreateShopToContinue', { next: 'create-shop' });
    return tenant.id;
  }

  /** PLN-11: the product limit must reflect a per-tenant override, not just the plan snapshot. */
  async shopOf(request: DashboardRequest): Promise<CatalogueShop> {
    const tenant = request.tenant;
    if (!tenant) throw new ApiError('forbidden', 'CreateShopToContinue', { next: 'create-shop' });
    return {
      id: tenant.id,
      state: tenant.state,
      planLimits: await this.limitOverrides.effectiveLimits(tenant.id, tenant.planLimits),
      businessType: tenant.businessType,
    };
  }

  /** The acting staff member, or null for the owner's own session (AUD-02), and the client address. */
  actorOf(request: DashboardRequest): CatalogueActor {
    return { userId: request.session?.userId ?? null, ip: this.clientIp.resolve(request) };
  }

  /** PST-04, ATL-01: the operator curating the platform's library, and from where (AUD-03). */
  operatorOf(request: OperatorSessionRequest): OperatorActor {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    return { operatorId: session.operatorId, ip: this.clientIp.resolve(request) };
  }

  /** A path id that is not an id is simply no such thing. */
  idOf(raw: string, notFound: MessageKey): string {
    const parsed = catalogueIdSchema.safeParse(raw);
    if (!parsed.success) throw new ApiError('not_found', notFound, {});
    return parsed.data;
  }
}
