import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ServerRole } from '../src/config/server-role';
import type { MailService } from '../src/modules/shared/mail/services/mail.service';
import { MailWorker } from '../src/modules/shared/mail/services/mail-worker';
import type { MessagingService } from '../src/modules/shared/messaging/services/messaging.service';
import { SmsWorker } from '../src/modules/shared/messaging/services/sms-worker';
import type { OutboxStore } from '../src/modules/shared/queue/ports/outbox-store';
import type { PgBossClient } from '../src/modules/shared/queue/services/pg-boss-client';
import { JobRelay } from '../src/modules/shared/queue/services/job-relay';

// D9-11: the outbox relay and the SMS and mail retries run only where jobs run. Under NODE_ENV=test they never start, so
// each case here steps out of it for the one call that starts the timer.
const timers = {
  'the outbox relay': (role: ServerRole) =>
    new JobRelay({} as OutboxStore, {} as PgBossClient, { SERVER_ROLE: role }),
  'the SMS retries': (role: ServerRole) =>
    new SmsWorker({} as MessagingService, { SERVER_ROLE: role }),
  'the mail retries': (role: ServerRole) =>
    new MailWorker({} as MailService, { SERVER_ROLE: role }),
};

describe.each(Object.entries(timers))('%s by server role (D9-11)', (_name, make) => {
  const nodeEnv = process.env['NODE_ENV'];
  let running: { onModuleDestroy(): void } | undefined;

  beforeEach(() => {
    process.env['NODE_ENV'] = 'production';
  });

  afterEach(() => {
    process.env['NODE_ENV'] = nodeEnv;
    running?.onModuleDestroy();
    running = undefined;
  });

  function started(role: ServerRole): boolean {
    const timer = make(role);
    running = timer;
    timer.onModuleInit();
    return Reflect.get(timer, 'timer') !== undefined;
  }

  it('an API process never starts it', () => {
    expect(started('api')).toBe(false);
  });

  it('the worker starts it', () => {
    expect(started('worker')).toBe(true);
  });

  it('one process running everything starts it', () => {
    expect(started('all')).toBe(true);
  });
});
