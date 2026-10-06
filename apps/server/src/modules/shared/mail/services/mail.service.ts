import { Inject, Injectable } from '@nestjs/common';
import { ChallengeKind } from '@lytronix/validators';
import { MailDeliveryError } from '../../../../common/errors/mail-delivery';
import { MAIL_PROVIDER } from '../tokens';
import type { MailProvider } from '../ports/mail-provider';

/** Emails the one-time codes for email sign-in and password reset (AUTH-05, AUTH-17). */
@Injectable()
export class MailService {
  constructor(@Inject(MAIL_PROVIDER) private readonly provider: MailProvider) {}

  async deliverShopReady(to: string, liveUrl: string): Promise<void> {
    try {
      await this.provider.send({
        to,
        subject: 'Your shop is ready',
        body: `Your shop is ready: ${liveUrl}`,
      });
    } catch {
      throw new MailDeliveryError();
    }
  }

  async deliverCode(to: string, code: string, purpose: ChallengeKind): Promise<void> {
    const subject =
      purpose === ChallengeKind.Reset ? 'Your password reset code' : 'Your sign-in code';
    const body = `Your code is ${code}. It expires in 5 minutes. Do not share it.`;
    try {
      await this.provider.send({ to, subject, body });
    } catch {
      throw new MailDeliveryError();
    }
  }
}
