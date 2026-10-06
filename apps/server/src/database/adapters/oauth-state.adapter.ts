import { Inject, Injectable } from '@nestjs/common';
import type { OauthProvider } from '@lytronix/validators';
import { OauthStateRepository } from '@lytronix/db';
import type { OauthStateStore } from '../../modules/identity/ports/oauth-state-store';
import { DatabaseService } from '../database.service';

/** OAuth state rows (AUTH-24), through the OAuth state repository on the pool. */
@Injectable()
export class DrizzleOauthStateStore implements OauthStateStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(OauthStateRepository) private readonly states: OauthStateRepository,
  ) {}

  insert(values: {
    state: string;
    provider: OauthProvider;
    codeVerifier: string;
    expiresAt: Date;
    attachToSubscriberId: string | null;
  }): Promise<void> {
    return this.states.insert(this.database.handle.db, values);
  }

  consume(
    state: string,
    provider: OauthProvider,
    now: Date,
  ): Promise<{ codeVerifier: string; attachToSubscriberId: string | null } | null> {
    return this.states.consume(this.database.handle.db, state, provider, now);
  }
}
