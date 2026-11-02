import { Inject, Injectable } from '@nestjs/common';
import type { SelectListenerDevice, Transaction } from '@lytronix/db';
import {
  ActorType,
  AuditAction,
  AuditResult,
  LISTENER_CODES_KEPT_DAYS,
  LISTENER_REVOKED_KEPT_DAYS,
  ListenerRevokeReason,
  PlatformActorType,
  PlatformAuditAction,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { DAY_MS } from '../../../common/time';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import { CatalogueActivity } from '../../catalogue/services/catalogue-activity';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import type { ListenerStore } from '../ports/listener-store';
import { LISTENER_CLOCK, LISTENER_STORE } from '../tokens';
import type { ListenerDeviceList, ListenerDeviceView } from '../types/listener';
import { ListenerRules } from './listener-rules';

/**
 * LSN-02, LSN-05, LSN-19 to LSN-23 (Phase 5 Slice 5.4a): a shop's paired phones as its owner and Lytro see and change
 * them. The shop lists them with how many its plan allows (listener:read), renames and revokes them
 * (listener:manage); the operator lists any shop's, revokes any phone, and blocks an app installation across the
 * platform, revoking its phones. A revocation takes effect on the phone's next call, which reads it live (LSN-19); each
 * is in both logs. The purge removes spent codes and long-revoked phones (LSN-05); the day-60 deletion every one.
 */
@Injectable()
export class ListenerDevices {
  constructor(
    @Inject(LISTENER_STORE) private readonly store: ListenerStore,
    @Inject(ListenerRules) private readonly rules: ListenerRules,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
    @Inject(LISTENER_CLOCK) private readonly clock: () => Date,
  ) {}

  /** LSN-08, LSN-20: the shop's phones, how many work, and its plan's limit. */
  async list(tenantId: string): Promise<ListenerDeviceList> {
    const [offline, limit] = await Promise.all([
      this.rules.offlineMinutes(),
      this.rules.deviceLimit(tenantId),
    ]);
    const now = this.clock();
    const devices = await this.store.run((tx) => this.store.listForTenant(tx, tenantId));
    const views = devices.map((device) => this.rules.viewOf(device, now, offline));
    return {
      devices: views,
      active: devices.filter((device) => device.revokedAt === null).length,
      limit,
    };
  }

  /** LSN-20: the operator's view of one shop's phones. */
  async listForOperator(tenantId: string): Promise<ListenerDeviceList> {
    const shop = await this.store.run((tx) => this.store.shopOf(tx, tenantId));
    if (!shop) throw new ApiError('not_found', 'ShopNotFound', {});
    return this.list(tenantId);
  }

  async rename(
    tenantId: string,
    id: string,
    name: string,
    actor: CatalogueActor,
  ): Promise<ListenerDeviceView> {
    const who = await this.activity.resolve(tenantId, actor);
    const offline = await this.rules.offlineMinutes();
    return this.store.run(async (tx) => {
      const device = await this.find(tx, tenantId, id);
      const renamed = await this.store.rename(tx, device.id, name);
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.ListenerDeviceRenamed,
        { type: 'listener_device', id: device.id },
        { from: device.name, to: name },
      );
      return this.rules.viewOf(renamed, this.clock(), offline);
    });
  }

  /** LSN-02, LSN-19: the shop revokes one of its phones; its next call is refused. */
  async revoke(tenantId: string, id: string, actor: CatalogueActor): Promise<ListenerDeviceView> {
    const who = await this.activity.resolve(tenantId, actor);
    const offline = await this.rules.offlineMinutes();
    return this.store.run(async (tx) => {
      const device = await this.find(tx, tenantId, id);
      const revoked = await this.revokeWithin(tx, device, ListenerRevokeReason.Owner, {
        actor: who,
        platformActor: { type: PlatformActorType.System, id: null },
      });
      return this.rules.viewOf(revoked, this.clock(), offline);
    });
  }

  /** LSN-19, LSN-21: Lytro revokes a phone of any shop. */
  operatorRevoke(id: string, operatorId: string, ip: string | null): Promise<void> {
    return this.store.run(async (tx) => {
      const device = await this.store.findDevice(tx, null, id, true);
      if (!device) throw new ApiError('not_found', 'ListenerDeviceNotFound', {});
      if (device.revokedAt !== null) {
        throw new ApiError('conflict', 'ListenerDeviceAlreadyRevoked', {});
      }
      await this.revokeWithin(tx, device, ListenerRevokeReason.Operator, {
        actor: { id: null, ip, type: ActorType.PlatformSupport },
        platformActor: { type: PlatformActorType.Operator, id: operatorId },
      });
    });
  }

  /**
   * LSN-21: an app installation blocked across the platform -- it pairs with no shop again, and every phone it paired is
   * revoked, each in both logs. How many phones it revoked.
   */
  blockInstallation(
    installationId: string,
    reason: string,
    operatorId: string,
    ip: string | null,
  ): Promise<number> {
    return this.store.run(async (tx) => {
      await this.store.block(tx, { installationId, reason, blockedBy: operatorId });
      const devices = await this.store.lockLiveForInstallation(tx, installationId);
      for (const device of devices) {
        await this.revokeWithin(tx, device, ListenerRevokeReason.InstallationBlocked, {
          actor: { id: null, ip, type: ActorType.PlatformSupport },
          platformActor: { type: PlatformActorType.Operator, id: operatorId },
        });
      }
      await this.platformAudit.recordWithin(tx, {
        actorType: PlatformActorType.Operator,
        actorId: operatorId,
        action: PlatformAuditAction.ListenerInstallationBlocked,
        targetType: 'listener_installation',
        targetId: null,
        result: AuditResult.Success,
        ip,
        summary: { installationId, reason, revoked: devices.length },
      });
      return devices.length;
    });
  }

  /** LSN-05: codes spent or run out a day ago, and phones revoked [30] days ago, removed. Safe to run again. */
  purge(now: Date): Promise<{ codes: number; devices: number }> {
    return this.store.run((tx) =>
      this.store.purge(
        tx,
        new Date(now.getTime() - LISTENER_CODES_KEPT_DAYS * DAY_MS),
        new Date(now.getTime() - LISTENER_REVOKED_KEPT_DAYS * DAY_MS),
      ),
    );
  }

  /** LSN-23: the shop's codes, phones and (Slice 5.4b) what they forwarded, at day 60. Safe to run again. */
  deleteAllForTenant(tenantId: string): Promise<void> {
    return this.store.run((tx) => this.store.deleteForTenant(tx, tenantId));
  }

  /** LSN-02, LSN-12, LSN-21, LSN-22: a working phone revoked with its reason, in both logs. */
  async revokeWithin(
    tx: Transaction,
    device: SelectListenerDevice,
    reason: ListenerRevokeReason,
    by: {
      actor: { id: string | null; ip: string | null; type?: ActorType };
      platformActor: { type: PlatformActorType; id: string | null };
    },
  ): Promise<SelectListenerDevice> {
    const revoked = await this.store.revoke(tx, device.id, {
      revokedBy:
        by.platformActor.type === PlatformActorType.Operator ? by.platformActor.id : by.actor.id,
      reason,
      at: this.clock(),
    });
    await this.rules.recordBoth(tx, {
      tenantId: device.tenantId,
      actor: by.actor,
      platformActor: by.platformActor,
      action: AuditAction.ListenerDeviceRevoked,
      platformAction: PlatformAuditAction.ListenerDeviceRevoked,
      deviceId: device.id,
      summary: { name: device.name, reason },
    });
    return revoked;
  }

  private async find(tx: Transaction, tenantId: string, id: string): Promise<SelectListenerDevice> {
    const device = await this.store.findDevice(tx, tenantId, id, true);
    if (!device) throw new ApiError('not_found', 'ListenerDeviceNotFound', {});
    if (device.revokedAt !== null) {
      throw new ApiError('conflict', 'ListenerDeviceAlreadyRevoked', {});
    }
    return device;
  }
}
