import { Inject, Injectable } from '@nestjs/common';
import {
  ChatFeatureMode,
  LIVE_CHAT_FEATURE,
  PlatformActorType,
  PlatformAuditAction,
  AuditResult,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import type { ChatStore } from '../ports/chat-store';
import { CHAT_CLOCK, CHAT_STORE } from '../tokens';
import { ChatBus } from './chat-bus';

/** LC-2: a shop's chat as its plan and its own setting make it. */
export interface ChatFeatureState {
  /** What the shop's current plan says. */
  plan: boolean;
  /** The shop's own setting: follow the plan, or on or off whatever it says. */
  mode: ChatFeatureMode;
  /** Whether the shop has the chat now. */
  on: boolean;
}

/**
 * LC-2 (the owner, 2026-11-27: "i can assign it to a plan or a shop and can also unassign it"): the chat is a plan
 * feature, read from the shop's CURRENT plan rather than its purchase snapshot -- it's Lytro's support channel, not a
 * paid entitlement, so switching it on a plan reaches every shop on it at once -- with the shop's own override on top.
 */
@Injectable()
export class ChatFeature {
  constructor(
    @Inject(CHAT_STORE) private readonly store: ChatStore,
    @Inject(CHAT_CLOCK) private readonly clock: () => Date,
    @Inject(PlatformAuditService)
    private readonly audit: Pick<PlatformAuditService, 'recordWithin'>,
    @Inject(ChatBus) private readonly bus: Pick<ChatBus, 'publish'>,
  ) {}

  async state(tenantId: string): Promise<ChatFeatureState> {
    const holdings = await this.store.featureHoldings(tenantId, LIVE_CHAT_FEATURE);
    if (holdings === null) throw new ApiError('not_found', 'PageNotFound', {});
    const plan = holdings.planFeatures?.[LIVE_CHAT_FEATURE] === true;
    const mode =
      holdings.override === null
        ? ChatFeatureMode.Plan
        : holdings.override
          ? ChatFeatureMode.On
          : ChatFeatureMode.Off;
    return { plan, mode, on: holdings.override ?? plan };
  }

  async on(tenantId: string): Promise<boolean> {
    return (await this.state(tenantId)).on;
  }

  /** LC-2: the operator sets a shop's own chat. Switching it off closes the shop's open chat at once (§4). */
  async set(
    tenantId: string,
    mode: ChatFeatureMode,
    operatorId: string,
    ip: string | null,
  ): Promise<ChatFeatureState> {
    const before = await this.state(tenantId);
    const enabled = mode === ChatFeatureMode.Plan ? null : mode === ChatFeatureMode.On;
    await this.store.run(async (tx) => {
      await this.store.setFeatureOverride(
        tx,
        tenantId,
        LIVE_CHAT_FEATURE,
        enabled,
        operatorId,
        this.clock(),
      );
      await this.audit.recordWithin(tx, {
        actorType: PlatformActorType.Operator,
        actorId: operatorId,
        action: PlatformAuditAction.ShopFeatureSet,
        targetType: 'tenant',
        targetId: tenantId,
        result: AuditResult.Success,
        ip,
        summary: { feature: LIVE_CHAT_FEATURE, from: before.mode, to: mode },
      });
    });
    const after = await this.state(tenantId);
    if (before.on && !after.on) await this.bus.publish({ type: 'closed', tenantId });
    return after;
  }
}
