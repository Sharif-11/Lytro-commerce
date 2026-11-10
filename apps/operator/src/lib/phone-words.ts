import { bdMobileNumber } from '@lytronix/validators';

/** A Bangladeshi mobile number as the console prints one, "01712 345678"; anything else as it came. */
export function spacedPhone(phone: string): string {
  const local = bdMobileNumber(phone);
  return local ? `${local.slice(0, 5)} ${local.slice(5)}` : phone;
}
