import { Inject, Injectable } from '@nestjs/common';
import { NotificationKind } from '@lytronix/validators';
import { listenerPhoneText, NOTIFICATION_LINKS } from '../../notifications/notification-words';
import { Notifications } from '../../notifications/services/notifications';
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
 * messages. A shop's own phone is also told to the shop's people who manage the listener, in the bell and by push
 * (NTF-03, Slice 7.3). That each is told once is the listener's, and its tests prove it.
 */
@Injectable()
export class MailListenerNotifier implements ListenerNotifier {
  constructor(
    @Inject(OperatorAlerts) private readonly operators: OperatorAlerts,
    @Inject(Notifications) private readonly notifications: Notifications,
  ) {}

  async deviceAutoRevoked(notice: ListenerAutoRevokedNotice): Promise<void> {
    if (notice.tenantId !== null) {
      await this.tellShop(notice.tenantId, notice.name, 'auto_revoked');
    }
    await this.operators.alert(
      `Listener phone revoked: ${notice.name}`,
      `${whose(notice.tenantId)} "${notice.name}" (${notice.deviceId}) was revoked on its own after ` +
        `${String(notice.flags)} calls from another app installation (LSN-12). Pair it again from the console or the ` +
        'dashboard once it is checked.',
    );
  }

  async deviceRevokedByLytro(notice: ListenerLytroRevokedNotice): Promise<void> {
    // LSN-21: the shop is told; Lytro revoked it, so its operators already know.
    await this.tellShop(notice.tenantId, notice.name, 'revoked_by_lytro');
  }

  async volumeFlagged(notice: ListenerVolumeNotice): Promise<void> {
    if (notice.tenantId !== null) {
      await this.tellShop(notice.tenantId, notice.name, 'volume_flagged');
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

  private async tellShop(
    tenantId: string,
    name: string,
    what: 'auto_revoked' | 'revoked_by_lytro' | 'volume_flagged',
  ): Promise<void> {
    await this.notifications.notify({
      tenantId,
      kind: NotificationKind.ListenerPhone,
      text: listenerPhoneText(name, what),
      link: NOTIFICATION_LINKS.listener,
    });
  }
}
