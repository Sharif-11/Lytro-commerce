import { Inject, Injectable } from '@nestjs/common';
import { StaffService } from '../../staff/services/staff.service';
import { TenantSummaries } from '../../tenancy/services/tenant-summaries.service';
import type { TenantSummary } from '../../tenancy/types/tenant-summary';
import type { SignupGateway } from '../ports/signup-gateway';
import type { SessionRecord } from '../ports/session-store';
import { SIGNUP_GATEWAY } from '../tokens';

/** A shop the signed-in person may work on, and who they act as there: the owner, or their staff row. */
export interface ShopMembership {
  tenant: TenantSummary;
  /** Null when the person acts as the shop's owner; otherwise their staff row in that shop. */
  userId: string | null;
}

/** One entry of the shop picker (TEN-31). */
export interface ShopListing {
  slug: string;
  shopName: string;
  role: 'owner' | 'staff';
}

/**
 * TEN-31: which shops a signed-in person belongs to. The dashboard names a shop on every request (SHOP_HEADER); this
 * decides whether the person may open it and who they act as. A sign-in with the person's own credentials (code,
 * password, Google, Facebook) covers every shop they own or work in. A staff sign-in, with the password a shop's owner
 * set for them (STF-01, STF-13), covers only that shop: the owner knows that password, so it never opens a shop the
 * staff member owns. A shop the person doesn't belong to is treated exactly like a shop that doesn't exist.
 */
@Injectable()
export class ShopMemberships {
  constructor(
    @Inject(TenantSummaries) private readonly summaries: TenantSummaries,
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(SIGNUP_GATEWAY)
    private readonly gateway: Pick<SignupGateway, 'run' | 'findOwnedTenant'>,
  ) {}

  /** The shop a dashboard page names, if the person belongs to it. */
  async ofSlug(session: SessionRecord, slug: string): Promise<ShopMembership | null> {
    const tenant = await this.summaries.findBySlug(slug);
    return tenant ? this.check(session, tenant) : null;
  }

  /** The shop of a request that names none (the steps right after sign-up): the one the session started on. */
  async ofSession(session: SessionRecord): Promise<ShopMembership | null> {
    if (session.tenantId === null) return null;
    const tenant = await this.summaries.findById(session.tenantId);
    return tenant ? this.check(session, tenant) : null;
  }

  /** Every shop the person may open, for the shop picker: their own first, then the one they work in. */
  async list(session: SessionRecord): Promise<ShopListing[]> {
    if (this.isStaffSignIn(session)) {
      const tenant = session.tenantId ? await this.summaries.findById(session.tenantId) : null;
      return tenant ? [this.listing(tenant, 'staff')] : [];
    }
    const owned = await this.gateway.run((tx) =>
      this.gateway.findOwnedTenant(tx, session.subscriberId),
    );
    const staffShop = await this.staff.staffShopOf(session.subscriberId);
    const listings: ShopListing[] = [];
    const ownedSummary = owned ? await this.summaries.findById(owned.id) : null;
    if (ownedSummary) listings.push(this.listing(ownedSummary, 'owner'));
    const staffSummary = staffShop?.active
      ? await this.summaries.findById(staffShop.tenantId)
      : null;
    if (staffSummary) listings.push(this.listing(staffSummary, 'staff'));
    return listings;
  }

  private async check(
    session: SessionRecord,
    tenant: TenantSummary,
  ): Promise<ShopMembership | null> {
    if (this.isStaffSignIn(session)) {
      return tenant.id === session.tenantId ? { tenant, userId: session.userId } : null;
    }
    // A deleted shop is still its owner's: its invoices and frozen balance stay readable (BIL-13, BAL-18), and the
    // dashboard guard keeps it to those lapsed routes. The picker leaves it out, so the owner opens a new shop (LIF-21).
    if (tenant.ownerSubscriberId === session.subscriberId) return { tenant, userId: null };
    // An inactive staff row opens nothing (STF-05).
    const staffShop = await this.staff.staffShopOf(session.subscriberId);
    return staffShop?.active === true && staffShop.tenantId === tenant.id
      ? { tenant, userId: staffShop.userId }
      : null;
  }

  /** A staff sign-in carries its staff row from the moment it opens; the person's own sign-in carries none. */
  private isStaffSignIn(session: SessionRecord): boolean {
    return session.userId !== null;
  }

  private listing(tenant: TenantSummary, role: ShopListing['role']): ShopListing {
    return { slug: tenant.slug, shopName: tenant.shopName, role };
  }
}
