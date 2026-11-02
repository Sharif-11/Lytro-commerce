import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { SelectListenerDevice } from '@lytronix/db';
import { ClientIp } from '../../../common/client-ip';
import { headerValue, type HttpRequest } from '../../../common/http';
import { ListenerApp } from '../services/listener-app';

/** A listener app call, once its device is known. */
export interface ListenerRequest extends HttpRequest {
  listenerDevice?: SelectListenerDevice;
  listenerAppVersion?: string;
}

/**
 * LSN-02, LSN-07, LSN-11, LSN-12, LSN-18 (Phase 5 Slice 5.4a): the gate of the listener app's calls after pairing. The
 * app names its device token (`Authorization: Bearer`), its installation (`x-installation-id`) and its version
 * (`x-app-version`); `ListenerApp` checks them all, live.
 */
@Injectable()
export class ListenerDeviceGuard implements CanActivate {
  constructor(
    @Inject(ListenerApp) private readonly app: ListenerApp,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ListenerRequest>();
    const authorization = headerValue(request.headers['authorization']) ?? '';
    const called = await this.app.authenticate({
      token: authorization.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length)
        : undefined,
      installationId: headerValue(request.headers['x-installation-id']),
      appVersion: headerValue(request.headers['x-app-version']),
      ip: this.clientIp.resolve(request),
    });
    request.listenerDevice = called.device;
    request.listenerAppVersion = called.appVersion;
    return true;
  }
}
