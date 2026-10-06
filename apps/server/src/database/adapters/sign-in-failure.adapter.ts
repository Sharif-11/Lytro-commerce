import { Inject, Injectable } from '@nestjs/common';
import { SignInFailureRepository, type FailureScope } from '@lytronix/db';
import type { SignInFailureStore } from '../../modules/identity/ports/sign-in-failure-store';
import { DatabaseService } from '../database.service';

/** Failed sign-ins (AUTH-14), through the sign-in failure repository on the pool. */
@Injectable()
export class DrizzleSignInFailureStore implements SignInFailureStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(SignInFailureRepository) private readonly failures: SignInFailureRepository,
  ) {}

  record(values: { subscriberId: string | null; ip: string | null }): Promise<void> {
    return this.failures.insert(this.database.handle.db, values);
  }

  countSince(scope: FailureScope, since: Date): Promise<number> {
    return this.failures.countSince(this.database.handle.db, scope, since);
  }
}
