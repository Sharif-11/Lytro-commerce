import {
  PUBLISHED_PRIVACY_VERSIONS,
  PUBLISHED_TERMS_VERSIONS,
  type PrivacyVersion,
  type TermsVersion,
} from '@lytronix/validators';
import privacy20261120bn from '@/content/legal/privacy/2026-11-20.bn.md';
import privacy20261120en from '@/content/legal/privacy/2026-11-20.en.md';
import terms20261120bn from '@/content/legal/terms/2026-11-20.bn.md';
import terms20261120en from '@/content/legal/terms/2026-11-20.en.md';
import type { Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';
import { type LegalDocument, parseLegalMarkdown } from './legal-markdown';

export type LegalKind = 'terms' | 'privacy';

// LEG-01 (Slice 9.8): every published version's text in Bangla and English, keyed by its name. The keys are typed by the
// validators' lists, so a version published without its text, or text for a version never published, fails the
// typecheck. The Bangla counts; the English is its translation, block for block.
const terms: Record<TermsVersion, Bilingual> = {
  '2026-11-20': { bn: terms20261120bn, en: terms20261120en },
};
const privacy: Record<PrivacyVersion, Bilingual> = {
  '2026-11-20': { bn: privacy20261120bn, en: privacy20261120en },
};

export class LegalLibrary {
  private readonly parsed = new Map<string, LegalDocument>();

  constructor(
    private readonly texts: Record<LegalKind, Readonly<Record<string, Bilingual>>>,
    private readonly published: Record<LegalKind, readonly string[]>,
  ) {}

  /** The published versions, oldest first. */
  versions(kind: LegalKind): readonly string[] {
    return this.published[kind];
  }

  /** One published version in one language, read once and kept; null for a version that isn't published. */
  find(kind: LegalKind, version: string, language: Language): LegalDocument | null {
    if (!this.published[kind].includes(version)) return null;
    const text = this.texts[kind][version];
    if (!text) return null;
    const key = `${kind}/${version}.${language}`;
    let document = this.parsed.get(key);
    if (!document) {
      document = parseLegalMarkdown(text[language], key);
      this.parsed.set(key, document);
    }
    return document;
  }

  /** The version in force: the one the server names (the platform setting sign-up records), when its text is published.
      Without the server, the newest published version that has taken effect by `today` (Dhaka); before the first one
      takes effect, the first. */
  inForce(kind: LegalKind, named: string | null, today: string): string {
    const versions = this.published[kind];
    if (named !== null && versions.includes(named)) return named;
    const started = versions.filter((version) => version <= today);
    const chosen = started[started.length - 1] ?? versions[0];
    if (chosen === undefined) throw new Error(`no published ${kind} version`);
    return chosen;
  }
}

export const legalLibrary = new LegalLibrary(
  { terms, privacy },
  { terms: PUBLISHED_TERMS_VERSIONS, privacy: PUBLISHED_PRIVACY_VERSIONS },
);
