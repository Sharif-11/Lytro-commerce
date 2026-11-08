import type { Language } from '@lytronix/validators';
import { DHAKA_OFFSET_MS } from '../time';

const BANGLA_MONTHS = [
  'জানুয়ারি',
  'ফেব্রুয়ারি',
  'মার্চ',
  'এপ্রিল',
  'মে',
  'জুন',
  'জুলাই',
  'আগস্ট',
  'সেপ্টেম্বর',
  'অক্টোবর',
  'নভেম্বর',
  'ডিসেম্বর',
];

/** The Dhaka wall clock at an instant, read with the UTC getters (TRM-09: a fixed UTC+6). */
function dhakaClock(date: Date): Date {
  return new Date(date.getTime() + DHAKA_OFFSET_MS);
}

/** A day as each language writes it, in Dhaka: "5 Dec", "5 ডিসেম্বর". */
export function dhakaDay(date: Date, language: Language): string {
  if (language === 'bn') {
    const dhaka = dhakaClock(date);
    return `${String(dhaka.getUTCDate())} ${BANGLA_MONTHS[dhaka.getUTCMonth()] ?? ''}`;
  }
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Dhaka',
  });
}

/** The part of the day a Bangla time names, by the hour in Dhaka. */
function banglaPartOfDay(hour: number): string {
  if (hour < 4) return 'রাত';
  if (hour < 6) return 'ভোর';
  if (hour < 12) return 'সকাল';
  if (hour < 15) return 'দুপুর';
  if (hour < 18) return 'বিকাল';
  if (hour < 20) return 'সন্ধ্যা';
  return 'রাত';
}

/** A time of day as each language writes it, in Dhaka: "2 am", "2:30 pm", "রাত 2টা", "বিকাল 4:30". */
export function dhakaTime(date: Date, language: Language): string {
  const dhaka = dhakaClock(date);
  const hour = dhaka.getUTCHours();
  const minute = dhaka.getUTCMinutes();
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  const minutes = minute === 0 ? '' : `:${String(minute).padStart(2, '0')}`;
  if (language === 'bn') {
    return `${banglaPartOfDay(hour)} ${String(twelve)}${minute === 0 ? 'টা' : minutes}`;
  }
  return `${String(twelve)}${minutes} ${hour < 12 ? 'am' : 'pm'}`;
}
