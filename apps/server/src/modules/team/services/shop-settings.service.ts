import { Inject, Injectable } from '@nestjs/common';
import type { ContactDetailsRow } from '@lytronix/db';
import {
  ActorType,
  AuditAction,
  AuditResult,
  type ShopSettings,
  type UpdateShopSettingsInput,
} from '@lytronix/validators';
import { AuditService } from '../../audit/services/audit.service';
import { ShopDeliveryRateService } from '../../balance/services/shop-delivery-rate.service';
import { StaffService } from '../../staff/services/staff.service';
import { TenantService } from '../../tenancy/services/tenant.service';

/** TEN-30/RAT-14: a tenant's own support/contact details and its one per-tenant rate, set from dashboard
    settings any time after onboarding -- two different tables (`control.tenants`, `tenant.shop_settings`)
    behind one combined "shop settings" shape. */
@Injectable()
export class ShopSettingsService {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(ShopDeliveryRateService) private readonly deliveryRate: ShopDeliveryRateService,
  ) {}

  async get(tenantId: string): Promise<ShopSettings> {
    const contact = await this.tenants.runStandalone(async (tx) => {
      const row = await this.tenants.findContactDetails(tx, tenantId);
      return row ?? { contactPhone: null, contactEmail: null, businessAddress: null };
    });
    const extraDeliveryChargePerKg = await this.deliveryRate.get(tenantId);
    return { ...contact, extraDeliveryChargePerKg };
  }

  async update(
    tenantId: string,
    actingUserId: string | null,
    input: UpdateShopSettingsInput,
    ip?: string | null,
  ): Promise<ShopSettings> {
    const values: Partial<ContactDetailsRow> = {};
    if ('contactPhone' in input) values.contactPhone = input.contactPhone ?? null;
    if ('contactEmail' in input) values.contactEmail = input.contactEmail ?? null;
    if ('businessAddress' in input) values.businessAddress = input.businessAddress ?? null;

    if (Object.keys(values).length > 0) {
      await this.tenants.runStandalone((tx) =>
        this.tenants.updateContactDetails(tx, tenantId, values),
      );
    }

    const summary: Record<string, unknown> = { ...values };
    if (input.extraDeliveryChargePerKg !== undefined) {
      summary.extraDeliveryChargePerKg = await this.deliveryRate.set(
        tenantId,
        input.extraDeliveryChargePerKg,
      );
    }

    const actorId = actingUserId ?? (await this.staff.ownerId(tenantId));
    await this.audit.recordStandalone({
      tenantId,
      actorType: ActorType.User,
      actorId,
      action: AuditAction.ShopSettingsUpdated,
      ip: ip ?? null,
      targetType: 'tenant',
      targetId: tenantId,
      result: AuditResult.Success,
      summary,
    });

    return this.get(tenantId);
  }
}
