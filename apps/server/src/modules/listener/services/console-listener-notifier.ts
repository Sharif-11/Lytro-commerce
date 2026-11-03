import { Injectable, Logger } from '@nestjs/common';
import type {
  ListenerAutoRevokedNotice,
  ListenerNotifier,
  ListenerUnreadNotice,
  ListenerVolumeNotice,
} from '../ports/listener-notifier';

/**
 * LSN-12: the stand-in until Phase 7's notification module delivers in-app and push notices, as the order and payment
 * notifiers are. It only logs; that the owner and Lytro are told once, when the phone is revoked, is the listener's.
 */
@Injectable()
export class ConsoleListenerNotifier implements ListenerNotifier {
  private readonly logger = new Logger('ListenerRevoked');

  deviceAutoRevoked(notice: ListenerAutoRevokedNotice): Promise<void> {
    this.logger.warn(
      `tenant ${notice.tenantId ?? 'Lytro'}: listener phone ${notice.name} revoked after ${String(notice.flags)} flags`,
    );
    return Promise.resolve();
  }

  volumeFlagged(notice: ListenerVolumeNotice): Promise<void> {
    this.logger.warn(
      `tenant ${notice.tenantId ?? 'Lytro'}: listener phone ${notice.name} is sending too much`,
    );
    return Promise.resolve();
  }

  unreadMessages(notice: ListenerUnreadNotice): Promise<void> {
    this.logger.warn(`${String(notice.total)} wallet messages could not be read on ${notice.day}`);
    return Promise.resolve();
  }
}
