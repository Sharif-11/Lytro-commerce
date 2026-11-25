import { bdMobileNumber, phoneShown, phoneShownInternational } from '@lytronix/validators';

// AUTH-02's format, read the way people write a number. The owner, 2026-11-25: "in mobile number input box the +88 is
// fixed since customer intrinsically start with 0" -- so a phone field has no fixed +880 before it and takes the number
// as typed or pasted: 01712345678, 1712345678, 8801712345678 or +8801712345678, with spaces or dashes. This is the one
// reader every field and draft uses; it stands on the server's own (`bdMobileNumber`, @lytronix/validators), and what
// reaches the server is still +8801XXXXXXXXX.

export class BangladeshiPhone {
  /** Any way a Bangladeshi mobile number is written → `+8801712345678`; null when it isn't one. */
  read(typed: string): string | null {
    const local = this.localOf(typed);
    return local === null ? null : `+88${local}`;
  }

  /** Any way it is written → its local form, `01712345678`; null when it isn't one. */
  localOf(typed: string): string | null {
    return bdMobileNumber(typed);
  }

  /** A saved number in a field, as people write it: `+8801712345678` → `01712345678`. */
  forField(value: string): string {
    return this.localOf(value) ?? value;
  }

  /**
   * `+8801712345678` → `01712345678`: how a number is shown, one run of digits with no spaces or dashes (the owner,
   * 2026-11-25; @lytronix/validators `phoneShown`).
   */
  display(value: string): string {
    return phoneShown(value);
  }

  /** `01712345678` or `+8801712345678` → `8801712345678`, as a WhatsApp link wants it. */
  forWhatsapp(value: string): string {
    const local = this.localOf(value);
    return local === null ? value.replace(/\D/g, '') : `88${local}`;
  }

  /** `01712345678` → `+8801712345678`, as the number a code went to is written: one run of digits. */
  international(value: string): string {
    return phoneShownInternational(value);
  }
}

export const bangladeshiPhone = new BangladeshiPhone();
