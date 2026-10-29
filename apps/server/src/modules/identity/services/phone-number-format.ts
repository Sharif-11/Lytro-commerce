import { Injectable } from '@nestjs/common';
import { bdMobileNumber } from '@lytronix/validators';

// AUTH-02: a Bangladeshi mobile number, in the one form the shared helper gives (orders read it too, ORD-01).
@Injectable()
export class PhoneNumberFormat {
  /** Returns the local form (01XXXXXXXXX), or null when the input is not a Bangladeshi mobile number. */
  normalize(input: string): string | null {
    return bdMobileNumber(input);
  }
}
