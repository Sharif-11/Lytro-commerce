import { banglaPartOfDay, type HelpLineView } from '@lytronix/validators';
import type { Copy } from '../i18n/copy';

/**
 * The help line's numbers and hours as the site writes them (SITE-PAGES-DESIGN §2, Slice 8.8). The numbers arrive in the
 * local form the console takes (01XXXXXXXXX).
 */
export class HelpLineWords {
  constructor(private readonly copy: Copy) {}

  /** `9 am`, `10 pm`; in Bangla the part of the day and the hour in Bangla digits, `সকাল ৯টা`, or `সকাল ৯টায়` for "at". */
  hour(hour24: number, at = false): string {
    const twelve = hour24 % 12 === 0 ? 12 : hour24 % 12;
    if (this.copy.language === 'en') return `${String(twelve)} ${hour24 < 12 ? 'am' : 'pm'}`;
    return `${banglaPartOfDay(hour24)} ${this.copy.count(twelve)}${at ? 'টায়' : 'টা'}`;
  }

  /** `09:00 – 22:00`, as the hours card's row writes the day's span. */
  span(line: HelpLineView): string {
    return `${clock(line.opensHour)} – ${clock(line.closesHour)}`;
  }
}

/** `01712345678` → `+880 17-1234-5678`, as the contact page shows a number to read out. */
export function displayNumber(local: string): string {
  const digits = local.replace(/\D/g, '').replace(/^880/, '').replace(/^0/, '');
  return digits.length === 10
    ? `+880 ${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`
    : local;
}

/** A WhatsApp chat with the number, as `wa.me` wants it (8801XXXXXXXXX). */
export function whatsappHref(local: string): string {
  return `https://wa.me/${internationalDigits(local)}`;
}

/** A call to the number. */
export function phoneHref(local: string): string {
  return `tel:+${internationalDigits(local)}`;
}

function internationalDigits(local: string): string {
  const digits = local.replace(/\D/g, '').replace(/^880/, '').replace(/^0/, '');
  return `880${digits}`;
}

function clock(hour24: number): string {
  return `${String(hour24).padStart(2, '0')}:00`;
}
