import { Inject, Injectable, Logger } from '@nestjs/common';
import { OperatorAlerts } from '../../shared/mail/services/operator-alerts';
import type {
  ListenerAutoRevokedNotice,
  ListenerLytroRevokedNotice,
  ListenerNotifier,
  ListenerUnreadNotice,
  ListenerVolumeNotice,
} from '../ports/listener-notifier';

/** Whose phone a notice is about, as an operator reads it. */
function whose(tenantId: string | null): string {
  return tenantId === null ? "Lytro's own listener phone" : `Shop ${tenantId}'s listener phone`;
}

/**
 * LSN-12, LSN-14, LSN-21, VER-06: what Lytro's operators are told of the listener phones, by email (D7-43, Slice 7.3's
 * read): a phone revoked on its own or sending too much, Lytro's own or a shop's, and the day's unreadable wallet
 * messages. The shop owner's part -- their own phone revoked or flagged -- is the bell's and push's, Slice 7.3b; until
 * then it is logged, as the stand-in did. That each is told once is the listener's, and its tests prove it.
 */
@Injectable()
export class MailListenerNotifier implements ListenerNotifier {
  private readonly logger = new Logger('ListenerNotices');

  constructor(@Inject(OperatorAlerts) private readonly operators: OperatorAlerts) {}

  async deviceAutoRevoked(notice: ListenerAutoRevokedNotice): Promise<void> {
    if (notice.tenantId !== null) {
      this.logger.warn(`tenant ${notice.tenantId}: listener phone ${notice.name} revoked`);
    }
    await this.operators.alert(
      `Listener phone revoked: ${notice.name}`,
      `${whose(notice.tenantId)} "${notice.name}" (${notice.deviceId}) was revoked on its own after ` +
        `${String(notice.flags)} calls from another app installation (LSN-12). Pair it again from the console or the ` +
        'dashboard once it is checked.',
    );
  }

  deviceRevokedByLytro(notice: ListenerLytroRevokedNotice): Promise<void> {
    // LSN-21: the shop's owner is told; Lytro revoked it, so its operators already know.
    this.logger.warn(
      `tenant ${notice.tenantId}: listener phone ${notice.name} revoked by Lytro (${notice.reason})`,
    );
    return Promise.resolve();
  }

  async volumeFlagged(notice: ListenerVolumeNotice): Promise<void> {
    if (notice.tenantId !== null) {
      this.logger.warn(
        `tenant ${notice.tenantId}: listener phone ${notice.name} is sending too much`,
      );
    }
    await this.operators.alert(
      `Listener phone sending too much: ${notice.name}`,
      `${whose(notice.tenantId)} "${notice.name}" (${notice.deviceId}) is sending more wallet messages than a phone ` +
        'should (LSN-14). Look at it in the console.',
    );
  }

  async unreadMessages(notice: ListenerUnreadNotice): Promise<void> {
    await this.operators.alert(
      `Unreadable wallet messages on ${notice.day}`,
      `${String(notice.total)} wallet messages could not be read on ${notice.day} (VER-06). A wallet may have ` +
        "changed its message's wording: check the listener's senders and patterns in the console.",
    );
  }
}
