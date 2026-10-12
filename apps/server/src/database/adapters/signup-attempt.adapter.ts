import { Inject, Injectable } from '@nestjs/common';
import { SignupAttemptRepository } from '@lytronix/db';
import type { SignupAttemptStore } from '../../modules/identity/ports/signup-attempt-store';
import { DatabaseService } from '../database.service';

/** Sign-up code requests (SUP-08), through the signup attempt repository on the pool. */
@Injectable()
export class DrizzleSignupAttemptStore implements SignupAttemptStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(SignupAttemptRepository) private readonly attempts: SignupAttemptRepository,
  ) {}

  record(ip: string): Promise<void> {
    return this.attempts.insert(this.database.handle.db, ip);
  }

  countSince(ip: string, since: Date): Promise<number> {
    return this.attempts.countSince(this.database.handle.db, ip, since);
  }
}
