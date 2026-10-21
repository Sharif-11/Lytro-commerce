import { randomBytes } from 'node:crypto';
import { Global, Logger, Module } from '@nestjs/common';
import type { Env } from '../../../config/env';
import { ENV } from '../../../config/tokens';
import { SecretBox, type SecretBoxKeys } from './secret-box';
import { SECRET_BOX_KEYS } from './tokens';

/**
 * SEC-10: the keys from the environment, which on real servers a secrets manager sets (env.ts requires the current
 * one in production). Outside production, with none set, a key made at start-up and gone at the next: values sealed
 * with it do not outlive the process.
 */
function keysOf(env: Env): SecretBoxKeys {
  const current = env.DATA_ENCRYPTION_KEY;
  const previous = env.DATA_ENCRYPTION_PREVIOUS_KEY;
  if (current) {
    return {
      current: Buffer.from(current, 'base64'),
      previous: previous ? Buffer.from(previous, 'base64') : null,
    };
  }
  new Logger('SecretBox').warn(
    'DATA_ENCRYPTION_KEY is not set: sealing with a key that lasts until this process stops',
  );
  return { current: randomBytes(32), previous: null };
}

// SEC-01, SEC-10: sealed storage for credentials, for any module that keeps one.
@Global()
@Module({
  providers: [{ provide: SECRET_BOX_KEYS, inject: [ENV], useFactory: keysOf }, SecretBox],
  exports: [SecretBox],
})
export class SecretsModule {}
