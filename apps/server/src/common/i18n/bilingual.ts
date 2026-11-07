import type { Language } from '@lytronix/validators';

/** Words written in both of Lytro's languages, one definition each (I18N-01). */
export type Bilingual<T> = Readonly<Record<Language, T>>;

/** I18N-01: Bangla is the platform's default, for anyone who hasn't chosen. */
export const DEFAULT_LANGUAGE: Language = 'bn';

/** The words in a reader's language, Bangla when they haven't chosen one (Slice 7.3's read). */
export function inLanguage<T>(words: Bilingual<T>, language: Language | null | undefined): T {
  return words[language ?? DEFAULT_LANGUAGE];
}

/** An email's subject and body, as every notice to a person has them. */
export interface MailText {
  subject: string;
  body: string;
}

/** A notice's email in both languages; it goes in the reader's own (Slice 7.3's read). */
export type MailWords = Bilingual<MailText>;
