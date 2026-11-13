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
 * TEN-05, SMS-18, D8-19; amended 2026-11-12 (the owner's word on staging, replacing D8-70's "এখন লাইভ" and the storefront's
 * address): a new shop's name and where to run it, its dashboard, to its owner. On lytro.app the words and the dashboard's
 * address take 61 characters before the name and the shop's address, so a name and address of up to 9 together go as one
 * SMS (৳0.55), longer as two (৳1.10); Lytro's cost either way (AUTH-21).
 */
export function shopReadyText(shopName: string, dashboardUrl: string): string {
  return `আপনার শপ ${shopName} তৈরি হয়েছে। শপ চালান এখানে: ${dashboardUrl}`;
}
