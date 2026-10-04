import { Injectable } from '@nestjs/common';

// AUTH-02: a Bangladeshi mobile number is 01[3-9] followed by 8 digits. +88 or 88 is normalised away.
const LOCAL_MOBILE = /^01[3-9]\d{8}$/;

@Injectable()
export class PhoneNumberFormat {
  /** Returns the local form (01XXXXXXXXX), or null when the input is not a Bangladeshi mobile number. */
  normalize(input: string): string | null {
    const compact = input.replace(/[\s-]/g, '');
    const local = compact.startsWith('+88')
      ? compact.slice(3)
      : compact.startsWith('88')
        ? compact.slice(2)
        : compact;
    return LOCAL_MOBILE.test(local) ? local : null;
  }
}
