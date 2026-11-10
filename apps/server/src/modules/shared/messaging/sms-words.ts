import type { Language } from '@lytronix/validators';

/**
 * SMS-01 (Slices 7.1 and 7.7): the SMS Lytro sends in its own words, written once, for sending them and for the
 * dashboard's SMS settings, which shows each as it reads. The owner's own words for codes (Slice 7.1's read), in the
 * shape BulkSMSBD asks codes to take.
 */

/** A sign-in code to Lytro. */
export function loginCodeText(code: string): string {
  return `Lytro-এ লগইনের জন্য OTP হচ্ছে ${code}। কারো সাথে শেয়ার করবেন না।`;
}

/** A password reset code: the owner's, or a staff member's, which their shop pays for (AUTH-21). */
export function resetCodeText(code: string): string {
  return `Lytro-এ পাসওয়ার্ড রিসেটের জন্য OTP হচ্ছে ${code}। কারো সাথে শেয়ার করবেন না।`;
}

/** CUS-04: a customer's sign-up code at a shop, in the language its storefront is read in. */
export function shopperCodeText(language: Language, shopName: string, code: string): string {
  return language === 'en'
    ? `Your ${shopName} OTP is ${code}. Do not share it with anyone.`
    : `${shopName}-এ সাইন আপের জন্য OTP হচ্ছে ${code}। কারো সাথে শেয়ার করবেন না।`;
}

/**
 * TEN-05, SMS-18, D8-19, D8-70 (Slice 8.7's read, the owner's words): a new shop's name and address, to its owner. On a
 * lytro.app address the words take 38 of a unit's 67 characters, so a name and its address of up to 29 together (a 14-letter
 * name) go as one SMS, longer as two; Lytro's cost either way (AUTH-21).
 */
export function shopReadyText(shopName: string, liveUrl: string): string {
  return `আপনার শপ ${shopName} এখন লাইভ: ${liveUrl}`;
}
