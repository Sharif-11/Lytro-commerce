import { Module } from '@nestjs/common';
import type { Env } from '../../../config/env';
import { ENV } from '../../../config/tokens';
import { DrizzleMailStore } from '../../../database/adapters/mail.adapter';
import { DrizzleOperatorInboxes } from '../../../database/adapters/operator-inboxes.adapter';
import { mailProviderFor } from './providers/mail-provider-choice';
import type { MailFetch } from './providers/resend-mail.provider';
import { MailService } from './services/mail.service';
import { MailWorker } from './services/mail-worker';
import { OperatorAlerts } from './services/operator-alerts';
import { ResendWebhook } from './services/resend-webhook';
import { MAIL_CLOCK, MAIL_FETCH, MAIL_PROVIDER, MAIL_STORE, OPERATOR_INBOXES } from './tokens';

// D7-22 (Slice 7.3): the provider follows the server's mode -- recorded in tests, printed in development unless forced,
// sent through Resend in production.
@Module({
  providers: [
    {
      provide: MAIL_FETCH,
      useValue: ((input, init) => fetch(input, init)) satisfies MailFetch,
    },
    {
      provide: MAIL_PROVIDER,
      inject: [ENV, MAIL_FETCH],
      useFactory: (env: Env, fetchMail: MailFetch) => mailProviderFor(env, fetchMail),
    },
    { provide: MAIL_STORE, useClass: DrizzleMailStore },
    { provide: MAIL_CLOCK, useValue: (): Date => new Date() },
    { provide: OPERATOR_INBOXES, useClass: DrizzleOperatorInboxes },
    MailService,
    MailWorker,
    ResendWebhook,
    OperatorAlerts,
  ],
  exports: [MailService, OperatorAlerts, ResendWebhook],
})
export class MailModule {}
