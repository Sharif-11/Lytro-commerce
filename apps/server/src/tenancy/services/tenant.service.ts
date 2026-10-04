import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { StaffService } from '../../staff/services/staff.service';
import { MessagingService, type OutboundMessage } from '../../messaging/services/messaging.service';
import { CLOCK, TENANT_STORE } from '../tokens';

// D3, TRL-01, TRL-05: a shop starts on the Trial plan for 30 days. The rules are here, not in the repository.
export const TRIAL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface TenantStore {
  findTrialPlan(tx: Transaction): Promise<{ id: string; limits: unknown } | null>;
  insertTenant(
    tx: Transaction,
    values: {
      ownerIdentityId: string;
      subscriberId: string;
      shopName: string;
      slug: string;
      planId: string;
      planSnapshot: unknown;
      periodStart: Date;
      periodEnd: Date;
    },
  ): Promise<string>;
}

export interface TrialShopRequest {
  identityId: string;
  subscriberId: string;
  shopName: string;
  slug: string;
  ownerPhone: string;
  ownerName: string;
  liveUrl: string;
}

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
  ): Promise<{ tenantId: string; messages: OutboundMessage[] }> {
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
      name: request.ownerName,
    });
    const ready = await this.messaging.queueShopReady(tx, request.ownerPhone, request.liveUrl);
    return { tenantId, messages: [ready] };
  }
}
