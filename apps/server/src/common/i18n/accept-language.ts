import type { Language } from '@lytronix/validators';

interface Candidate {
  tag: string;
  q: number;
}

function parse(header: string): Candidate[] {
  return header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam === undefined ? 1 : Number(qParam.trim().slice(2));
      return { tag: (tag ?? '').trim().toLowerCase(), q: Number.isFinite(q) ? q : 1 };
    })
    .filter((c) => c.tag.length > 0)
    .sort((a, b) => b.q - a.q);
}

/**
 * Bangla is the platform default (I18N-01, SRS-detailed §2.6) -- a request with no Accept-Language header, or
 * one that doesn't ask for English specifically, gets Bangla. English only when the header's highest-weighted
 * tag starts with "en" (e.g. "en", "en-US").
 */
export function resolveLanguage(acceptLanguage: string | undefined): Language {
  if (acceptLanguage === undefined || acceptLanguage.trim().length === 0) return 'bn';
  const [best] = parse(acceptLanguage);
  return best?.tag.startsWith('en') === true ? 'en' : 'bn';
}
