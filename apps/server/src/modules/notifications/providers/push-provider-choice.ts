import { Logger } from '@nestjs/common';
import type { Env } from '../../../config/env';
import type {
  PushMessage,
  PushOptions,
  PushOutcome,
  PushProvider,
  PushTarget,
} from '../ports/push-provider';
import { WebPushProvider, type PushFetch } from './web-push.provider';

export type PushMode = 'record' | 'log' | 'send';

/**
 * D7-22 (the owner's call, 2026-11-06), as D7-21 is for SMS: a push reaches a real person's phone, so where one goes
 * depends on the server's mode. Tests only record it. Development logs it, unless PUSH_FORCE_REAL is set. Production,
 * staging included, always sends, and the settings refuse to start it without the VAPID keys (config/env.ts).
 */
export function pushModeOf(env: Pick<Env, 'NODE_ENV' | 'PUSH_FORCE_REAL'>): PushMode {
  if (env.NODE_ENV === 'test') return 'record';
  if (env.NODE_ENV === 'production') return 'send';
  return env.PUSH_FORCE_REAL ? 'send' : 'log';
}

/** The stand-in: says what it would push, in development; silent in tests, where a spec replaces it to read pushes. */
export class ConsolePushProvider implements PushProvider {
  private readonly logger = new Logger('PushStub');

  constructor(
    readonly publicKey: string | null,
    private readonly quiet: boolean,
  ) {}

  send(target: PushTarget, message: PushMessage, options: PushOptions): Promise<PushOutcome> {
    if (!this.quiet) {
      this.logger.log(
        `to ${new URL(target.endpoint).hostname}: ${message.title} (${options.urgency}, ${message.url})`,
      );
    }
    return Promise.resolve('sent');
  }
}

/** The provider for the server's mode: the stand-in, or Web Push. */
export function pushProviderFor(
  env: Pick<
    Env,
    'NODE_ENV' | 'PUSH_FORCE_REAL' | 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_KEY' | 'VAPID_SUBJECT'
  >,
  fetchPush: PushFetch,
): PushProvider {
  const mode = pushModeOf(env);
  if (mode !== 'send')
    return new ConsolePushProvider(env.VAPID_PUBLIC_KEY ?? null, mode === 'record');
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    // The settings check makes this unreachable; kept so missing keys can never fall back to the stand-in quietly.
    throw new Error('VAPID keys missing: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY');
  }
  return new WebPushProvider(
    {
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
      subject: env.VAPID_SUBJECT,
    },
    fetchPush,
  );
}
