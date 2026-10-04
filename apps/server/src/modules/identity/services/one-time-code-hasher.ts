import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { CODE_LENGTH } from '@lytronix/validators';
import { OTP_SECRET } from '../tokens';

// AUTH-05: six-digit codes (length from @lytronix/validators), stored only as a keyed hash (HMAC, not bcrypt),
// bound to the phone number so a code for one number cannot be replayed for another.

@Injectable()
export class OneTimeCodeHasher {
  constructor(@Inject(OTP_SECRET) private readonly secret: string) {}

  generate(): string {
    return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
  }

  hash(code: string, phone: string): string {
    return createHmac('sha256', this.secret).update(`${phone}:${code}`).digest('hex');
  }

  /** Constant-time comparison of a typed code against the stored hash. */
  matches(code: string, phone: string, storedHash: string): boolean {
    const expected = Buffer.from(this.hash(code, phone));
    const stored = Buffer.from(storedHash);
    return expected.length === stored.length && timingSafeEqual(expected, stored);
  }
}
