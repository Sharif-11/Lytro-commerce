import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';

// D2: bcrypt with cost 12 or more.
export const BCRYPT_COST = 12;

/** Password hashing (D2). Checks spend the same time for a missing account as for a wrong password (AUTH-13). */
@Injectable()
export class PasswordHasher {
  private absentHash: Promise<string> | null = null;

  hash(password: string): Promise<string> {
    return hash(password, BCRYPT_COST);
  }

  verify(password: string, passwordHash: string): Promise<boolean> {
    return compare(password, passwordHash);
  }

  /** Runs a comparison against a dummy hash and always answers false. Used when there is no hash to check. */
  async verifyAbsent(password: string): Promise<false> {
    this.absentHash ??= hash('absent-account-placeholder', BCRYPT_COST);
    await compare(password, await this.absentHash);
    return false;
  }
}
