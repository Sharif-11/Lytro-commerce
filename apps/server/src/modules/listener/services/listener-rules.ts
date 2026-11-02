import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { ListenerShopRow, SelectListenerDevice, Transaction } from '@lytronix/db';
import {
  appVersionField,
  AuditResult,
  compareAppVersions,
  limitOf,
  LISTENER_MIN_APP_VERSION,
  LISTENER_OFFLINE_MINUTES,
  LISTENER_SENDERS,
  LISTENER_WALLETS,
  ListenerDeviceStatus,
  PlatformSettingKey,
  TenantState,
  type AuditAction,
  type PlatformActorType,
  type PlatformAuditAction,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { dhakaDate, MINUTE_MS } from '../../../common/time';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import { CatalogueActivity, type ResolvedActor } from '../../catalogue/services/catalogue-activity';
import { PaymentMethods } from '../../payment-methods/services/payment-methods';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import { UsageWarnings } from '../../usage-warnings/services/usage-warnings';
import type { ListenerAppFacts, ListenerDeviceView } from '../types/listener';

// LSN-07 (amended 2026-11-01, pay-as-you-go agreed): the states a shop may use the listener in.
const LISTENING_STATES: ReadonlySet<TenantState> = new Set([
  TenantState.Trial,
  TenantState.Active,
  TenantState.Grace,
  TenantState.PayAsYouGo,
]);

/** LSN-09, LSN-11: a code or token as it is kept -- its SHA-256 hash; both are long and random, so no slow hash. */
export function listenerHashOf(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * LSN-03, LSN-07, LSN-08, LSN-18, LSN-22 (Phase 5 Slice 5.4a): the rules every listener step shares -- the shop's
 * state at that moment, the oldest app allowed, the plan's device limit (its overrides and add-ons with it), when a
 * phone counts online, and each event written to the shop's activity log and the platform's audit log at once.
 */
@Injectable()
export class ListenerRules {
  constructor(
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
    @Inject(UsageWarnings) private readonly usage: UsageWarnings,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
    @Inject(PaymentMethods) private readonly methods: PaymentMethods,
  ) {}

  /** LSN-07: whether the shop may use the listener now -- trial, active, in grace or pay-as-you-go, and not suspended. */
  isListening(shop: ListenerShopRow | null): shop is ListenerShopRow {
    return shop !== null && LISTENING_STATES.has(shop.state) && shop.suspendedAt === null;
  }

  /** LSN-07: a shop that may not use the listener is refused, as the app shows "subscription inactive". */
  refuseInactive(shop: ListenerShopRow | null): ListenerShopRow {
    if (!this.isListening(shop)) throw new ApiError('tenant_offline', 'ListenerShopInactive', {});
    return shop;
  }

  /** LSN-18: an app without a version, or older than the platform's minimum, must update first. */
  async refuseOldApp(version: string | undefined): Promise<string> {
    const minimum = await this.minAppVersion();
    const parsed = appVersionField.safeParse(version);
    if (!parsed.success || compareAppVersions(parsed.data, minimum) < 0) {
      throw new ApiError('app_update_required', 'ListenerAppUpdateRequired', { minimum });
    }
    return parsed.data;
  }

  /** LSN-08 (agreed 2026-11-01): the phones the shop's plan pairs -- null for no limit. */
  async deviceLimit(tenantId: string): Promise<number | null> {
    return limitOf(await this.usage.limitsOf(tenantId), 'paired_devices');
  }

  async offlineMinutes(): Promise<number> {
    const setting = await this.settings.current(PlatformSettingKey.ListenerOfflineMinutes);
    return typeof setting?.value === 'number' ? setting.value : LISTENER_OFFLINE_MINUTES;
  }

  /** LSN-16 (amended 2026-11-02): the senders whose SMS count as a wallet's, one list for every shop. */
  async senders(): Promise<readonly string[]> {
    const setting = await this.settings.current(PlatformSettingKey.ListenerSenders);
    return Array.isArray(setting?.value) ? (setting.value as string[]) : LISTENER_SENDERS;
  }

  /** LSN-04 (Slice 5.4b): when this phone's test mode ends, while it is on. */
  testModeOf(device: SelectListenerDevice, now: Date): Date | null {
    return device.testModeUntil !== null && device.testModeUntil > now
      ? device.testModeUntil
      : null;
  }

  /**
   * Slice 5.5's sketch (Slice 5.4b): what the app needs on every answer -- the numbers whose receipts it can read, the
   * senders to let through, and whether test mode is on.
   */
  async appFactsOf(device: SelectListenerDevice, now: Date): Promise<ListenerAppFacts> {
    const [offered, senders] = await Promise.all([
      this.methods.forShoppers(device.tenantId),
      this.senders(),
    ]);
    return {
      accounts: offered.flatMap((row) =>
        LISTENER_WALLETS.includes(row.method) && row.number !== null
          ? [{ method: row.method, number: row.number }]
          : [],
      ),
      senders: [...senders],
      testModeUntil: this.testModeOf(device, now),
    };
  }

  viewOf(device: SelectListenerDevice, now: Date, offlineMinutes: number): ListenerDeviceView {
    return {
      id: device.id,
      name: device.name,
      model: device.model,
      appVersion: device.appVersion,
      pairedAt: device.pairedAt,
      lastSeenAt: device.lastSeenAt,
      online:
        device.revokedAt === null &&
        device.lastSeenAt !== null &&
        now.getTime() - device.lastSeenAt.getTime() < offlineMinutes * MINUTE_MS,
      status:
        device.revokedAt === null ? ListenerDeviceStatus.Active : ListenerDeviceStatus.Revoked,
      revokedAt: device.revokedAt,
      revokeReason: device.revokeReason,
      flags: device.flags,
      uploadsToday: device.uploadsDay === dhakaDate(now) ? device.uploadsToday : 0,
    };
  }

  /** LSN-22: one listener event in the shop's activity log and the platform's audit log, in the caller's transaction. */
  async recordBoth(
    tx: Transaction,
    event: {
      tenantId: string;
      actor: ResolvedActor;
      platformActor: { type: PlatformActorType; id: string | null };
      action: AuditAction;
      platformAction: PlatformAuditAction;
      deviceId: string | null;
      summary: Record<string, unknown>;
    },
  ): Promise<void> {
    const target = { type: 'listener_device', id: event.deviceId };
    await this.activity.record(
      tx,
      event.tenantId,
      event.actor,
      event.action,
      target,
      event.summary,
    );
    await this.platformAudit.recordWithin(tx, {
      actorType: event.platformActor.type,
      actorId: event.platformActor.id,
      action: event.platformAction,
      targetType: target.type,
      targetId: event.deviceId,
      result: AuditResult.Success,
      ip: event.actor.ip,
      summary: { tenantId: event.tenantId, ...event.summary },
    });
  }

  private async minAppVersion(): Promise<string> {
    const setting = await this.settings.current(PlatformSettingKey.ListenerMinAppVersion);
    return typeof setting?.value === 'string' ? setting.value : LISTENER_MIN_APP_VERSION;
  }
}
