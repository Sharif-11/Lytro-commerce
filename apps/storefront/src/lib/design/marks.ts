const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** A name's first letter as a reader sees it: a whole Bangla letter with its vowel sign ("মে", not "ম"), for a shop's
    mark and a quote's avatar (STOREFRONT-BUILDER-PLAN, as the sketch draws them). */
export function firstLetter(name: string): string {
  const letters = GRAPHEMES.segment(name.trim())[Symbol.iterator]();
  const first = letters.next();
  return first.done === true ? '' : first.value.segment.toUpperCase();
}
