import type { Language } from './language';

/** One string in both languages. Every piece of visible text on the site is one of these, written once,
    next to the component that shows it (CODING-CONVENTIONS §3: one definition per concept). */
export interface Bilingual {
  bn: string;
  en: string;
}

/** Picks the right language from a Bilingual pair. Built once per render with the visitor's language. */
export class Copy {
  constructor(readonly language: Language) {}

  of(text: Bilingual): string {
    return text[this.language];
  }

  /** Bangla digits for counts in running Bangla prose (BRAND-IDENTITY §5); Western digits elsewhere. */
  count(value: number): string {
    const digits = String(value);
    if (this.language === 'en') return digits;
    const bangla = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return digits.replace(/\d/g, (d) => bangla[Number(d)] ?? d);
  }
}
