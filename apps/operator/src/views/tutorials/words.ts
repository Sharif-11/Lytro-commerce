import { useTranslation } from 'react-i18next';
import type { TutorialPart, TutorialWords } from '@lytronix/validators';

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';

/** The sketch writes lengths, parts and counts in Bangla digits on a Bangla page; file names and sizes stay Latin. */
export function digitsFor(text: string | number, language: string): string {
  const value = String(text);
  return language === 'bn' ? value.replace(/\d/g, (d) => BANGLA_DIGITS[Number(d)] ?? d) : value;
}

/** A video's length as m:ss. */
export function lengthOf(seconds: number, language: string): string {
  const whole = Math.max(0, Math.round(seconds));
  const rest = whole % 60;
  return digitsFor(`${String(Math.floor(whole / 60))}:${String(rest).padStart(2, '0')}`, language);
}

/** A file's size in MB, as the sketch writes it (21 MB). */
export function megabytes(bytes: number): string {
  return String(Math.max(1, Math.round(bytes / (1024 * 1024))));
}

/** The words of a part, in the console's language. */
export function useTutorialWords(): {
  language: string;
  words: (words: TutorialWords) => string;
  title: (part: TutorialPart) => string;
  partNo: (part: TutorialPart) => string;
} {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const words = (each: TutorialWords) => (language === 'bn' ? each.bn : each.en);
  const partNo = (part: TutorialPart) => t('tutorials.part', { n: words(part.part) });
  return {
    language,
    words,
    partNo,
    title: (part) => `${partNo(part)} · ${words(part.name)}`,
  };
}
