import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { DAY_MS } from '../../../common/time';
import { StaffService } from '../../staff/services/staff.service';
import { MessagingService } from '../../shared/messaging/services/messaging.service';
import { type QueuedMessage } from '../../shared/messaging/types/messages';
import { CLOCK, TENANT_STORE } from '../tokens';
import type { TenantStore } from '../ports/tenant-store';
import type { TrialShopRequest } from '../types/trial-shop-request';

// D3, TRL-01, TRL-05: a shop starts on the Trial plan for 30 days. The rules are here, not in the repository.
export const TRIAL_DAYS = 30;

/**
 * Creates a shop in the trial state with its owner and the "shop ready" message (AUTH-10). It runs inside the
 * caller's transaction, so the shop, the owner and the message are created together or not at all.
 */
@Injectable()
export class TenantService {
  constructor(
    @Inject(TENANT_STORE) private readonly store: TenantStore,
    @Inject(CLOCK) private readonly clock: () => Date,
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(MessagingService) private readonly messaging: MessagingService,
  ) {}

  async createTrialShop(
    tx: Transaction,
    request: TrialShopRequest,
  ): Promise<{ tenantId: string; messages: QueuedMessage[] }> {
    const plan = await this.store.findTrialPlan(tx);
    if (!plan) throw new Error('the Trial plan is not seeded');

    const now = this.clock();
    const tenantId = await this.store.insertTenant(tx, {
      ownerIdentityId: request.identityId,
      subscriberId: request.subscriberId,
      shopName: request.shopName,
      slug: request.slug,
      planId: plan.id,
      planSnapshot: plan.limits,
      periodStart: now,
      periodEnd: new Date(now.getTime() + TRIAL_DAYS * DAY_MS),
    });

    await this.staff.createOwner(tx, {
      tenantId,
      phone: request.ownerPhone,
      email: request.ownerEmail,
      name: request.ownerName,
    });
    if (request.ownerPhone === null) return { tenantId, messages: [] };
    const ready = await this.messaging.queueShopReady(tx, request.ownerPhone, request.liveUrl);
    return { tenantId, messages: [ready] };
  }
}
