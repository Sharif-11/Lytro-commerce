import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SelectListenerDevice } from '@lytronix/db';
import {
  ActorType,
  AuditAction,
  LISTENER_FLAGS_MAX,
  LISTENER_HEARTBEAT_MINUTES,
  ListenerRevokeReason,
  PlatformActorType,
  PlatformAuditAction,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import type { ListenerNotifier } from '../ports/listener-notifier';
import type { ListenerStore } from '../ports/listener-store';
import { LISTENER_CLOCK, LISTENER_NOTIFIER, LISTENER_STORE } from '../tokens';
import type { ListenerConnected } from '../types/listener';
import { ListenerDevices } from './listener-devices';
import { ListenerLimits } from './listener-limits';
import { ListenerRules, listenerHashOf } from './listener-rules';

/** What a listener app call names: its token, its installation and its app's version. */
export interface ListenerCall {
  token: string | undefined;
  installationId: string | undefined;
  appVersion: string | undefined;
  ip: string | null;
}

/**
 * LSN-02, LSN-03, LSN-07, LSN-11 to LSN-13, LSN-18, LSN-19, LSN-24 (Phase 5 Slice 5.4a): the listener app's calls,
 * each checked live -- so a revocation or a shop's change of state shows on the very next call. An unknown token is
 * refused; a revoked phone is told so (401, with its reason); a call naming another installation is refused and flags
 * the phone, [3] flags revoking it and telling its owner and Lytro; a shop that may not listen is `tenant_offline`; an
 * app older than the minimum must update. The answers carry what the app shows (LSN-24).
 */
@Injectable()
export class ListenerApp {
  private readonly logger = new Logger('ListenerApp');

  constructor(
    @Inject(LISTENER_STORE) private readonly store: ListenerStore,
    @Inject(ListenerRules) private readonly rules: ListenerRules,
    @Inject(ListenerDevices) private readonly devices: ListenerDevices,
    @Inject(ListenerLimits) private readonly limits: ListenerLimits,
    @Inject(LISTENER_NOTIFIER) private readonly notifier: ListenerNotifier,
    @Inject(LISTENER_CLOCK) private readonly clock: () => Date,
  ) {}

  /** The phone a call comes from, and its app's version, once every check has passed. */
  async authenticate(
    call: ListenerCall,
  ): Promise<{ device: SelectListenerDevice; appVersion: string }> {
    const device = call.token
      ? await this.store.run((tx) =>
          this.store.findByTokenHash(tx, listenerHashOf(call.token ?? '')),
        )
      : null;
    if (!device) throw new ApiError('unauthenticated', 'ListenerTokenInvalid', {});
    if (device.revokedAt !== null) {
      throw new ApiError('unauthenticated', 'ListenerDeviceRevoked', {
        reason: device.revokeReason,
      });
    }
    if (call.installationId !== device.installationId) {
      await this.flag(device, call.ip);
      throw new ApiError('unauthenticated', 'ListenerTokenInvalid', {});
    }
    await this.store.run(async (tx) => {
      this.rules.refuseInactive(await this.store.shopOf(tx, device.tenantId));
    });
    return { device, appVersion: await this.rules.refuseOldApp(call.appVersion) };
  }

  /** LSN-03, LSN-13: the phone reports it is alive -- seen now, on this version; [4] an hour. */
  async heartbeat(device: SelectListenerDevice, appVersion: string): Promise<ListenerConnected> {
    const now = this.clock();
    this.limits.admitHeartbeat(device.id, now);
    await this.store.run((tx) => this.store.touch(tx, device.id, now, appVersion));
    return { status: 'connected', heartbeatMinutes: LISTENER_HEARTBEAT_MINUTES, serverTime: now };
  }

  /** LSN-12: a call from another installation flags the phone; the [3]rd flag revokes it and tells its owner and Lytro. */
  private async flag(device: SelectListenerDevice, ip: string | null): Promise<void> {
    const actor = { id: null, ip, type: ActorType.System };
    const platformActor = { type: PlatformActorType.System, id: null };
    const flags = await this.store.run(async (tx) => {
      const locked = await this.store.findDevice(tx, null, device.id, true);
      if (!locked || locked.revokedAt !== null) return 0;
      const count = await this.store.flag(tx, locked.id);
      await this.rules.recordBoth(tx, {
        tenantId: locked.tenantId,
        actor,
        platformActor,
        action: AuditAction.ListenerDeviceFlagged,
        platformAction: PlatformAuditAction.ListenerDeviceFlagged,
        deviceId: locked.id,
        summary: { name: locked.name, flags: count },
      });
      if (count >= LISTENER_FLAGS_MAX) {
        await this.devices.revokeWithin(tx, locked, ListenerRevokeReason.Flags, {
          actor,
          platformActor,
        });
      }
      return count;
    });
    if (flags >= LISTENER_FLAGS_MAX) {
      await this.notifier
        .deviceAutoRevoked({
          tenantId: device.tenantId,
          deviceId: device.id,
          name: device.name,
          flags,
        })
        .catch((error: unknown) => {
          this.logger.error(`could not tell of a revoked listener phone: ${String(error)}`);
        });
    }
  }
}
