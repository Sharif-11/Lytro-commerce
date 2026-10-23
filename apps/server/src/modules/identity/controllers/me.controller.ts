import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Dashboard } from '../../../common/decorators/dashboard';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { MeResponseDto } from '../dto/me-response.dto';
import { DashboardGuard, type DashboardRequest } from '../guards/dashboard.guard';
import { SessionGuard } from '../guards/session.guard';
import { BrandService } from '../../brand/services/brand.service';
import type { LiveBrand } from '../../brand/types/brand';
import type { ImageView } from '../../../common/media-links';
import { MediaService } from '../../media/services/media.service';
import { StaffService } from '../../staff/services/staff.service';
import { ShopMemberships, type ShopListing } from '../services/shop-memberships';
import { TenantService } from '../../tenancy/services/tenant.service';
import type { TenantSummary } from '../../tenancy/types/tenant-summary';

export interface MeResponse {
  subscriber: { id: string };
  /** `session.userId === null` (PermissionGuard's own test) — the owner implicitly holds every permission,
      so the frontend should treat this as "show everything" rather than checking `permissions` at all. */
  isOwner: boolean;
  /** Only meaningful when `isOwner` is false — the permission strings this signed-in staff member holds
      right now (STF-10/11), for client-side nav filtering (D32). Always `[]` for the owner. */
  permissions: string[];
  /** The signed-in person's own name in the shop the call names, for the header's initial; null when unnamed. */
  name: string | null;
  tenant: {
    id: string;
    slug: string;
    shopName: string;
    state: TenantSummary['state'];
    suspended: boolean;
    planName: string | null;
    periodEnd: string | null;
    /** BIL-17: the plan page's auto-renew switch reads its state here. */
    autoRenewEnabled: boolean;
    /** TEN-16: the shop's logo, which the dashboard's navigation shows; null for its monogram. */
    logo: ImageView | null;
    /** BRN-07: the shop's own identity, which the dashboard applies; null for Lytro's default. */
    brand: LiveBrand | null;
  } | null;
  shops: ShopListing[];
  /** LIF-21: the person has no shop open yet and owns a deleted one, whose balance the new shop takes over -- for
      create-shop's note. False whenever a shop is open, and for staff. */
  hasDeletedShop: boolean;
}

// The dashboard shell's account summary.
// LIF-24 (decided 2026-10-16): also carries `suspendedOwner: true` -- the owner needs /me to succeed while
// suspended so the dashboard shell can render the narrow suspended view instead of a dead end.
@ApiTags('Me')
@Controller('me')
@Dashboard({ lapsed: true, suspendedOwner: true, withoutShop: true })
@UseGuards(SessionGuard, DashboardGuard)
export class MeController {
  constructor(
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(ShopMemberships) private readonly memberships: ShopMemberships,
    @Inject(BrandService) private readonly brand: BrandService,
    @Inject(MediaService) private readonly media: MediaService,
    @Inject(TenantService) private readonly tenants: TenantService,
  ) {}

  @Get()
  @ResponseMessage('ProfileRetrieved')
  @ApiOperation({ summary: 'Get the signed-in account and tenant summary' })
  @ZodResponse({ type: MeResponseDto })
  async get(@Req() request: DashboardRequest): Promise<MeResponse> {
    const tenant = request.tenant ?? null;
    const userId = request.session?.userId ?? null;
    const isOwner = userId === null;
    const permissions =
      isOwner || tenant === null ? [] : ((await this.staff.permissionsOf(tenant, userId)) ?? []);
    const signedIn = request.signedIn ?? request.session;
    const shops = signedIn ? await this.memberships.list(signedIn) : [];
    const brand = tenant === null ? null : await this.brand.live(tenant.id);
    const logo = tenant === null ? null : await this.media.logoOf(tenant.id);
    const name = tenant === null ? null : await this.staff.nameOf(tenant, userId);
    const subscriberId = request.session?.subscriberId ?? null;
    const hasDeletedShop =
      tenant === null && isOwner && subscriberId !== null
        ? await this.tenants.hasDeletedShop(subscriberId)
        : false;
    return {
      subscriber: { id: request.session?.subscriberId ?? '' },
      isOwner,
      permissions,
      name,
      tenant:
        tenant === null
          ? null
          : {
              id: tenant.id,
              slug: tenant.slug,
              shopName: tenant.shopName,
              state: tenant.state,
              suspended: tenant.suspendedAt !== null,
              planName: tenant.planName,
              periodEnd: tenant.periodEnd?.toISOString() ?? null,
              autoRenewEnabled: tenant.autoRenewEnabled,
              logo,
              brand,
            },
      shops,
      hasDeletedShop,
    };
  }
}
