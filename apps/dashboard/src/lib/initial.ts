/** An avatar's letters: the name's first character as written, so "কামাল" gives "কা", as the prototype draws it. */
export function initialOf(name: string): string {
  const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(name.trim());
  const first = graphemes[Symbol.iterator]().next();
  return first.done ? '?' : first.value.segment.toUpperCase();
}
