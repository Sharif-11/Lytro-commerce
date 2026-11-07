import { Inject, Injectable } from '@nestjs/common';
import { NotificationKind, type MailSuppressionReason } from '@lytronix/validators';
import { emailBouncedText, NOTIFICATION_LINKS } from '../notification-words';
import type { NotificationStore } from '../ports/notification-store';
import { NOTIFICATION_STORE } from '../tokens';
import { Notifications } from './notifications';

/**
 * NTF-06, D7-38 (Slice 7.3): when Lytro stops emailing an address, the owner of each live shop who signs in with it is
 * told in the bell and by push -- the banner says it too, from `GET /me`. How many shops were told.
 */
@Injectable()
export class BounceNotices {
  constructor(
    @Inject(NOTIFICATION_STORE) private readonly store: NotificationStore,
    @Inject(Notifications) private readonly notifications: Notifications,
  ) {}

  async tell(
    stopped: readonly { email: string; reason: MailSuppressionReason }[],
  ): Promise<number> {
    let told = 0;
    for (const { email, reason } of stopped) {
      for (const tenantId of await this.store.shopsOwnedByEmail(email)) {
        await this.notifications.notify({
          tenantId,
          kind: NotificationKind.EmailBounced,
          text: emailBouncedText(email, reason),
          link: NOTIFICATION_LINKS.account,
        });
        told += 1;
      }
    }
    return told;
  }
}
