import { describe, expect, it } from 'vitest';
import {
  displayNumber,
  HelpLineWords,
  phoneHref,
  whatsappHref,
} from '../src/lib/contact/help-line-words';
import { Copy } from '../src/lib/i18n/copy';

// SITE-PAGES-DESIGN §2 (Slice 8.8, D8-73): the contact page writes the help line's hours and numbers, which the console
// sets as hours of a 24-hour clock and numbers in their local form.
describe("the help line's words on the site", () => {
  const line = { whatsapp: '01712345678', phone: null, opensHour: 9, closesHour: 22 };

  it('writes an hour as a sentence says it, in Bangla digits on the Bangla page', () => {
    const bangla = new HelpLineWords(new Copy('bn'));
    expect(bangla.hour(9)).toBe('সকাল ৯টা');
    expect(bangla.hour(22)).toBe('রাত ১০টা');
    expect(bangla.hour(9, true)).toBe('সকাল ৯টায়');
    expect(bangla.hour(13)).toBe('দুপুর ১টা');
    const english = new HelpLineWords(new Copy('en'));
    expect(english.hour(9)).toBe('9 am');
    expect(english.hour(22, true)).toBe('10 pm');
    expect(english.hour(0)).toBe('12 am');
    expect(english.hour(12)).toBe('12 pm');
  });

  it("writes the day's span on the 24-hour clock", () => {
    expect(new HelpLineWords(new Copy('bn')).span(line)).toBe('09:00 – 22:00');
  });

  it('shows a number to read out, and links to WhatsApp and a call', () => {
    expect(displayNumber('01712345678')).toBe('+880 17-1234-5678');
    expect(whatsappHref('01712345678')).toBe('https://wa.me/8801712345678');
    expect(phoneHref('01812345678')).toBe('tel:+8801812345678');
  });
});
