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
import { StaffService } from '../../staff/services/staff.service';
import { TenantService } from '../../tenancy/services/tenant.service';

/** TEN-30: a tenant's own support/contact details, set from dashboard settings any time after onboarding. */
@Injectable()
export class ShopSettingsService {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StaffService) private readonly staff: StaffService,
  ) {}

  get(tenantId: string): Promise<ShopSettings> {
    return this.tenants.runStandalone(async (tx) => {
      const row = await this.tenants.findContactDetails(tx, tenantId);
      return row ?? { contactPhone: null, contactEmail: null, businessAddress: null };
    });
  }

  async update(
    tenantId: string,
    actingUserId: string | null,
    input: UpdateShopSettingsInput,
  ): Promise<ShopSettings> {
    const values: Partial<ContactDetailsRow> = {};
    if ('contactPhone' in input) values.contactPhone = input.contactPhone ?? null;
    if ('contactEmail' in input) values.contactEmail = input.contactEmail ?? null;
    if ('businessAddress' in input) values.businessAddress = input.businessAddress ?? null;

    await this.tenants.runStandalone((tx) =>
      this.tenants.updateContactDetails(tx, tenantId, values),
    );

    const actorId = actingUserId ?? (await this.staff.ownerId(tenantId));
    await this.audit.recordStandalone({
      tenantId,
      actorType: ActorType.User,
      actorId,
      action: AuditAction.ShopSettingsUpdated,
      targetType: 'tenant',
      targetId: tenantId,
      result: AuditResult.Success,
      summary: values,
    });

    return this.get(tenantId);
  }
}
