import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { LAPSED_TENANT_STATES, TenantState } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { Dashboard } from '../../../common/decorators/dashboard';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { MeResponseDto } from '../dto/me-response.dto';
import { DashboardGuard, type DashboardRequest } from '../guards/dashboard.guard';
import { SessionGuard } from '../guards/session.guard';
import { BillingTermsService } from '../../billing/services/billing-terms.service';
import { LifecycleService, type StageLengths } from '../../billing/services/lifecycle.service';
import type { BillingTermRecord } from '../../billing/types/billing-term';
import { BrandService } from '../../brand/services/brand.service';
import type { LiveBrand } from '../../brand/types/brand';
import type { ImageView } from '../../../common/media-links';
import { MediaService } from '../../media/services/media.service';
import { StaffService } from '../../staff/services/staff.service';
import { ShopMemberships, type ShopListing } from '../services/shop-memberships';
import { isStaffSignIn } from '../services/staff-sign-in';
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
  /**
   * TEN-31, AUTH-31: `staff` for a sign-in made on the staff page with the password the shop set, which never changes
   * the person's own account (KNOWN-GAPS §96); `own` for the person's own phone, email, password, Google or Facebook.
   */
  signIn: 'own' | 'staff';
  /** The names of the roles the person holds in the shop the call names, for the Menu's card; none for the owner. */
  roles: string[];
  tenant:
    | ({
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
      } & ShopStanding)
    | null;
  shops: ShopListing[];
  /** LIF-21: the person has no shop open yet and owns a deleted one, whose balance the new shop takes over -- for
      create-shop's note. False whenever a shop is open, and for staff. */
  hasDeletedShop: boolean;
}

/**
 * TRM-12, LIF-12, LIF-26: where a paid shop stands -- the term its plan runs on (the plan card's "Starter · monthly", and
 * the term the plan page opens on), the days of each stage a lapse would take it through (the stop sheet's dated
 * steps) and, once lapsed, when its business data would be deleted (the Renew page).
 */
export interface ShopStanding {
  billingTerm: { id: string; labelEn: string; labelBn: string; months: number } | null;
  lapseStages: StageLengths | null;
  deletesAt: string | null;
}

// LIF-04: a paid plan's states with a lapse's dated steps still ahead of them; a locked shop has only the Renew page.
const STEPS_AHEAD: readonly TenantState[] = [
  TenantState.Active,
  TenantState.Grace,
  TenantState.ReadOnly,
];

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
    @Inject(BillingTermsService) private readonly terms: BillingTermsService,
    @Inject(LifecycleService) private readonly lifecycle: LifecycleService,
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
    const roles = tenant === null ? [] : await this.staff.roleNamesOf(tenant, userId);
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
      signIn: signedIn && isStaffSignIn(signedIn) ? 'staff' : 'own',
      roles,
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
              ...(await this.standingOf(tenant)),
            },
      shops,
      hasDeletedShop,
    };
  }

  /**
   * The term a paid plan runs on (none on a trial or pay-as-you-go), the stages its lapse would follow while some are
   * still ahead, and a lapsed shop's deletion date.
   */
  private async standingOf(tenant: TenantSummary): Promise<ShopStanding> {
    const paid = tenant.state !== TenantState.Trial && tenant.state !== TenantState.PayAsYouGo;
    const info = paid
      ? await this.tenants.runStandalone((tx) => this.tenants.findBillingInfo(tx, tenant.id))
      : null;
    const term = info?.billingTermId ? await this.termOf(info.billingTermId) : null;
    const deletesAt = LAPSED_TENANT_STATES.includes(tenant.state)
      ? await this.lifecycle.deletionDateOf(tenant.id)
      : null;
    return {
      billingTerm: term
        ? { id: term.id, labelEn: term.labelEn, labelBn: term.labelBn, months: term.months }
        : null,
      lapseStages: STEPS_AHEAD.includes(tenant.state)
        ? await this.lifecycle.lapseStagesOf(tenant.id)
        : null,
      deletesAt: deletesAt?.toISOString() ?? null,
    };
  }

  /** The term by its id; none when it has since been deleted. */
  private async termOf(id: string): Promise<BillingTermRecord | null> {
    try {
      return await this.terms.findById(id);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'not_found') return null;
      throw error;
    }
  }
}
