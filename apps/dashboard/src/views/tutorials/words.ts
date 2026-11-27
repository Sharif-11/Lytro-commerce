import type { TutorialWords } from '@lytronix/validators';

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';

/** The sketch writes the tutorials' numbers in Bangla digits on a Bangla page (পর্ব ৩ · ৩:১২, ০/৪, ৫টি নতুন). */
export function digitsFor(text: string | number, language: string): string {
  const value = String(text);
  return language === 'bn' ? value.replace(/\d/g, (d) => BANGLA_DIGITS[Number(d)] ?? d) : value;
}

/** A video's length as m:ss, read from its file. */
export function lengthOf(seconds: number, language: string): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return digitsFor(`${String(minutes)}:${String(rest).padStart(2, '0')}`, language);
}

/** A line of the series in the page's language. */
export function wordsIn(words: TutorialWords, language: string): string {
  return language === 'bn' ? words.bn : words.en;
}
