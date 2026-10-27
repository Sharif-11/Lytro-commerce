// AUTH-02's format, checked client-side for fast feedback. The server is the source of truth
// (apps/server/src/modules/identity/services/phone-number-format.ts); this mirrors it.
const BD_MOBILE_PATTERN = /^(?:\+?880|0)1[3-9]\d{8}$/;

export class BangladeshiPhone {
  /** The entry screen shows a fixed +880 prefix and takes the local part; this joins and cleans them. */
  fromLocalPart(localPart: string): string {
    const digits = localPart.replace(/\D/g, '').replace(/^880/, '').replace(/^0/, '');
    return `+880${digits}`;
  }

  isValid(value: string): boolean {
    return BD_MOBILE_PATTERN.test(value.trim());
  }

  /** `+8801712345678` → `01712-345678` for display. */
  display(value: string): string {
    const local = this.local(value);
    return local.length === 11 ? `${local.slice(0, 5)}-${local.slice(5)}` : value;
  }

  /** `+8801712345678` → `01712 345 678`, as a number to send money to is written. */
  grouped(value: string): string {
    const local = this.local(value);
    return local.length === 11
      ? `${local.slice(0, 5)} ${local.slice(5, 8)} ${local.slice(8)}`
      : value;
  }

  /** `+8801712345678` → `+880 1712 345 678`, as the number a code went to is written. */
  international(value: string): string {
    const part = this.localPart(value);
    return part === value ? value : `+880 ${part}`;
  }

  /** `+8801712345678` → `1712 345 678`: what a field with the fixed +880 prefix shows (the prototype's support phone). */
  localPart(value: string): string {
    const local = this.local(value);
    return local.length === 11
      ? `${local.slice(1, 5)} ${local.slice(5, 8)} ${local.slice(8)}`
      : value;
  }

  private local(value: string): string {
    const digits = value.replace(/\D/g, '').replace(/^880/, '');
    return digits.startsWith('0') ? digits : `0${digits}`;
  }
}

export const bangladeshiPhone = new BangladeshiPhone();
