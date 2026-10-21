import { Inject, Injectable } from '@nestjs/common';
import { catalogueIdSchema, type Permission } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import type { MessageKey } from '../../../common/i18n/message-key';
import type { CatalogueActor, CatalogueShop, OperatorActor } from '../../catalogue/types/catalogue';
import type { DashboardRequest } from '../../identity/guards/dashboard.guard';
import type { OperatorSessionRequest } from '../../operator/guards/operator-session.guard';
import { StaffService } from '../../staff/services/staff.service';

/** What every catalogue route reads off its request: the shop (with its effective limits) and who is acting. */
@Injectable()
export class CatalogueRequest {
  constructor(
    @Inject(ClientIp) private readonly clientIp: ClientIp,
    @Inject(StaffService) private readonly staff: StaffService,
  ) {}

  /**
   * Whether the caller holds a permission beyond the one the route requires, for what a response may show (D3-9:
   * cost needs inventory:manage). The owner holds every permission.
   */
  async holds(request: DashboardRequest, permission: Permission): Promise<boolean> {
    const session = request.session;
    const tenant = request.tenant;
    if (!session || !tenant) return false;
    if (session.userId === null) return true;
    const held = await this.staff.permissionsOf(
      { id: tenant.id, planLimits: tenant.planLimits },
      session.userId,
    );
    return held?.includes(permission) ?? false;
  }

  tenantIdOf(request: DashboardRequest): string {
    const tenant = request.tenant;
    if (!tenant) throw new ApiError('forbidden', 'CreateShopToContinue', { next: 'create-shop' });
    return tenant.id;
  }

  /** The shop, with its own limits: its snapshot with its overrides (PLN-11), as its summary carries them. */
  shopOf(request: DashboardRequest): Promise<CatalogueShop> {
    const tenant = request.tenant;
    if (!tenant) throw new ApiError('forbidden', 'CreateShopToContinue', { next: 'create-shop' });
    return Promise.resolve({
      id: tenant.id,
      state: tenant.state,
      planLimits: tenant.planLimits,
      businessType: tenant.businessType,
    });
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
