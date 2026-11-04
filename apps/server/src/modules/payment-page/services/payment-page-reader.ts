import { Inject, Injectable } from '@nestjs/common';
import { mainOrigin } from '../../../common/shop-address';
import type { Env } from '../../../config/env';
import { ENV } from '../../../config/tokens';
import { ShopStorefrontService } from '../../balance/services/shop-storefront.service';
import { DomainService } from '../../domains/services/domain.service';
import { MediaService } from '../../media/services/media.service';
import type { PaymentPageSession } from '../../payment-sessions/types/payment-sessions';
import { TenantService } from '../../tenancy/services/tenant.service';
import type { PageData } from '../page/screens';

/** PAY-05: the shop as the page's read shows it: its name, logo and contact phone, nothing else of its brand (BRN-04). */
export interface PaymentPageShop {
  name: string;
  logo: { id: string; urls: { main: string; thumbnail: string } } | null;
  contactPhone: string | null;
}

/** PAY-05, TEN-16, TEN-30: what the page's read adds to a session, for its JSON and its drawing alike. */
@Injectable()
export class PaymentPageReader {
  constructor(
    @Inject(MediaService) private readonly media: MediaService,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(ShopStorefrontService) private readonly storefront: ShopStorefrontService,
    @Inject(DomainService) private readonly domains: DomainService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async shopOf(tenantId: string, name: string): Promise<PaymentPageShop> {
    const [logo, contact] = await Promise.all([
      this.media.logoOf(tenantId),
      this.tenants.runStandalone((tx) => this.tenants.findContactDetails(tx, tenantId)),
    ]);
    return { name, logo, contactPhone: contact?.contactPhone ?? null };
  }

  /** PAY-24: where a link with no return address leads: the order's tracking page, if the shop has a storefront. */
  async orderPageOf(tenantId: string, slug: string, trackingId: string): Promise<string | null> {
    if (!(await this.storefront.isOn(tenantId))) return null;
    const host = await this.domains.servingHost(tenantId);
    return `${mainOrigin(this.env, slug, host)}/track/${encodeURIComponent(trackingId)}`;
  }

  /** What the page is drawn from. */
  async dataOf(
    shop: { id: string; shopName: string; slug: string },
    ref: string,
    session: PaymentPageSession,
  ): Promise<PageData> {
    const [details, orderPageUrl] = await Promise.all([
      this.shopOf(shop.id, shop.shopName),
      this.orderPageOf(shop.id, shop.slug, session.trackingId),
    ]);
    return {
      ref,
      session,
      shop: {
        name: details.name,
        logoUrl: details.logo?.urls.thumbnail ?? null,
        contactPhone: details.contactPhone,
      },
      orderPageUrl,
    };
  }
}
